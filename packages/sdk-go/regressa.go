// Package regressa is the Regressa SDK for Go: buffer LLM call traces and ship them to the ingest API.
//
//	client := regressa.New(regressa.Options{APIKey: os.Getenv("REGRESSA_API_KEY")})
//	defer client.Shutdown(context.Background())
//
//	span := client.Start("gpt-4o-mini", regressa.OpenAI, msgs, regressa.WithTemplate("support-agent", raw))
//	out, err := callOpenAI(...)
//	span.End(out, usage.PromptTokens, usage.CompletionTokens, err)
package regressa

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

const (
	SDKName    = "regressa-go"
	SDKVersion = "0.1.0"
	KeyHeader  = "X-Regressa-Project-Key"
	defaultURL = "https://ingest.regressa.dev"
)

// Provider identifies the upstream LLM vendor.
type Provider string

const (
	OpenAI    Provider = "openai"
	Anthropic Provider = "anthropic"
	Other     Provider = "other"
)

// Message mirrors a chat message; Content may be a string or provider-specific blocks.
type Message struct {
	Role    string      `json:"role"`
	Content interface{} `json:"content"`
}

// Template identifies the prompt template so Regressa can version it.
type Template struct {
	Name string `json:"name"`
	Raw  string `json:"raw"`
}

// Trace is one LLM call. Field names match the ingest API.
type Trace struct {
	ID               string                 `json:"id,omitempty"`
	Timestamp        string                 `json:"timestamp,omitempty"`
	Model            string                 `json:"model"`
	Provider         Provider               `json:"provider"`
	InputMessages    []Message              `json:"input_messages"`
	OutputText       *string                `json:"output_text,omitempty"`
	PromptTokens     *int                   `json:"prompt_tokens,omitempty"`
	CompletionTokens *int                   `json:"completion_tokens,omitempty"`
	TotalCostUSD     *float64               `json:"total_cost_usd,omitempty"`
	LatencyMs        *int                   `json:"latency_ms,omitempty"`
	Status           string                 `json:"status,omitempty"`
	ErrorMessage     string                 `json:"error_message,omitempty"`
	TraceGroupID     string                 `json:"trace_group_id,omitempty"`
	PromptTemplate   *Template              `json:"prompt_template,omitempty"`
	Metadata         map[string]interface{} `json:"metadata,omitempty"`
}

// Options configure the client. Zero values fall back to env vars and defaults.
type Options struct {
	APIKey          string        // default REGRESSA_API_KEY
	BaseURL         string        // default REGRESSA_BASE_URL or https://ingest.regressa.dev
	FlushAt         int           // default 50
	FlushInterval   time.Duration // default 2s
	Disabled        bool          // or REGRESSA_DISABLED=1
	DefaultMetadata map[string]interface{}
	HTTPClient      *http.Client
	OnError         func(error)
}

// Client buffers traces and flushes them in batches on a background timer.
type Client struct {
	opts   Options
	mu     sync.Mutex
	buf    []Trace
	timer  *time.Timer
	wg     sync.WaitGroup
	closed bool
}

// New creates a client. It never fails; with no API key it logs once and becomes a no-op.
func New(opts Options) *Client {
	if opts.APIKey == "" {
		opts.APIKey = os.Getenv("REGRESSA_API_KEY")
	}
	if opts.BaseURL == "" {
		opts.BaseURL = os.Getenv("REGRESSA_BASE_URL")
	}
	if opts.BaseURL == "" {
		opts.BaseURL = defaultURL
	}
	opts.BaseURL = strings.TrimRight(opts.BaseURL, "/")
	if opts.FlushAt <= 0 {
		opts.FlushAt = 50
	}
	if opts.FlushInterval <= 0 {
		opts.FlushInterval = 2 * time.Second
	}
	if os.Getenv("REGRESSA_DISABLED") == "1" {
		opts.Disabled = true
	}
	if opts.HTTPClient == nil {
		opts.HTTPClient = &http.Client{Timeout: 5 * time.Second}
	}
	if opts.OnError == nil {
		var once sync.Once
		opts.OnError = func(err error) {
			once.Do(func() { fmt.Fprintf(os.Stderr, "[regressa] failed to send traces: %v\n", err) })
		}
	}
	if opts.APIKey == "" && !opts.Disabled {
		fmt.Fprintln(os.Stderr, "[regressa] no API key set (REGRESSA_API_KEY); tracing disabled")
		opts.Disabled = true
	}
	return &Client{opts: opts}
}

// Trace records a single call. Safe for concurrent use.
func (c *Client) Trace(t Trace) {
	if c.opts.Disabled {
		return
	}
	if t.ID == "" {
		t.ID = newUUID()
	}
	if t.Timestamp == "" {
		t.Timestamp = time.Now().UTC().Format(time.RFC3339Nano)
	}
	if t.Status == "" {
		t.Status = "success"
	}
	if len(c.opts.DefaultMetadata) > 0 {
		merged := map[string]interface{}{}
		for k, v := range c.opts.DefaultMetadata {
			merged[k] = v
		}
		for k, v := range t.Metadata {
			merged[k] = v
		}
		t.Metadata = merged
	}
	c.mu.Lock()
	if c.closed {
		c.mu.Unlock()
		return
	}
	c.buf = append(c.buf, t)
	full := len(c.buf) >= c.opts.FlushAt
	if !full && c.timer == nil {
		c.timer = time.AfterFunc(c.opts.FlushInterval, func() { _ = c.Flush(context.Background()) })
	}
	c.mu.Unlock()
	if full {
		_ = c.Flush(context.Background())
	}
}

// Flush sends buffered traces now and waits for the request to complete.
func (c *Client) Flush(ctx context.Context) error {
	c.mu.Lock()
	if c.timer != nil {
		c.timer.Stop()
		c.timer = nil
	}
	batch := c.buf
	c.buf = nil
	c.mu.Unlock()
	if len(batch) == 0 {
		return nil
	}
	c.wg.Add(1)
	defer c.wg.Done()
	return c.send(ctx, batch)
}

// Shutdown flushes and stops accepting traces.
func (c *Client) Shutdown(ctx context.Context) error {
	err := c.Flush(ctx)
	c.mu.Lock()
	c.closed = true
	c.mu.Unlock()
	c.wg.Wait()
	return err
}

func (c *Client) send(ctx context.Context, batch []Trace) error {
	body, err := json.Marshal(map[string]interface{}{"traces": batch, "sdk": map[string]string{"name": SDKName, "version": SDKVersion}})
	if err != nil {
		return err
	}
	var lastErr error
	for attempt := 0; attempt < 4; attempt++ {
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.opts.BaseURL+"/v1/traces", bytes.NewReader(body))
		if err != nil {
			return err
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set(KeyHeader, c.opts.APIKey)
		req.Header.Set("User-Agent", SDKName+"/"+SDKVersion)
		res, err := c.opts.HTTPClient.Do(req)
		if err == nil {
			res.Body.Close()
			if res.StatusCode < 400 {
				return nil
			}
			if res.StatusCode != 429 && res.StatusCode < 500 {
				lastErr = fmt.Errorf("regressa ingest %d", res.StatusCode)
				break // client error: don't retry
			}
			err = fmt.Errorf("regressa ingest %d", res.StatusCode)
		}
		lastErr = err
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(time.Duration(250*(1<<attempt)) * time.Millisecond):
		}
	}
	c.opts.OnError(lastErr)
	return lastErr
}

// Span times an in-flight call; call End when the provider responds.
type Span struct {
	c       *Client
	t       Trace
	started time.Time
}

// SpanOption customizes a span.
type SpanOption func(*Trace)

// WithTemplate declares the prompt template for version tracking.
func WithTemplate(name, raw string) SpanOption {
	return func(t *Trace) { t.PromptTemplate = &Template{Name: name, Raw: raw} }
}

// WithGroup correlates several calls of one workflow.
func WithGroup(id string) SpanOption { return func(t *Trace) { t.TraceGroupID = id } }

// WithMetadata attaches metadata to this call.
func WithMetadata(m map[string]interface{}) SpanOption { return func(t *Trace) { t.Metadata = m } }

// Start begins timing a call.
func (c *Client) Start(model string, provider Provider, messages []Message, opts ...SpanOption) *Span {
	t := Trace{Model: model, Provider: provider, InputMessages: messages}
	for _, o := range opts {
		o(&t)
	}
	if t.PromptTemplate == nil {
		for _, m := range messages {
			if s, ok := m.Content.(string); ok && m.Role == "system" && s != "" {
				t.PromptTemplate = &Template{Name: "system:" + shortHash(s), Raw: s}
				break
			}
		}
	}
	return &Span{c: c, t: t, started: time.Now()}
}

// End records the outcome. Pass a non-nil err for failures.
func (s *Span) End(output string, promptTokens, completionTokens int, err error) {
	ms := int(time.Since(s.started).Milliseconds())
	s.t.LatencyMs = &ms
	if err != nil {
		s.t.Status = "error"
		if errors.Is(err, context.DeadlineExceeded) || strings.Contains(strings.ToLower(err.Error()), "timeout") {
			s.t.Status = "timeout"
		}
		s.t.ErrorMessage = err.Error()
	} else {
		s.t.Status = "success"
		s.t.OutputText = &output
		s.t.PromptTokens = &promptTokens
		s.t.CompletionTokens = &completionTokens
	}
	s.c.Trace(s.t)
}

func newUUID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	h := hex.EncodeToString(b)
	return h[:8] + "-" + h[8:12] + "-" + h[12:16] + "-" + h[16:20] + "-" + h[20:]
}

func shortHash(s string) string {
	var h uint32 = 2166136261
	for i := 0; i < len(s); i++ {
		h ^= uint32(s[i])
		h *= 16777619
	}
	return fmt.Sprintf("%08x", h)
}
