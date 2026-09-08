package regressa

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

type captured struct {
	Traces []map[string]interface{} `json:"traces"`
	SDK    map[string]string        `json:"sdk"`
}

func server(t *testing.T, status int, got *[]captured, keys *[]string) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		var c captured
		_ = json.Unmarshal(body, &c)
		*got = append(*got, c)
		*keys = append(*keys, r.Header.Get(KeyHeader))
		w.WriteHeader(status)
		_, _ = w.Write([]byte(`{"accepted":1,"rejected":0,"errors":[]}`))
	}))
}

func TestTraceBuffersAndFlushesWithHeader(t *testing.T) {
	var got []captured
	var keys []string
	srv := server(t, 202, &got, &keys)
	defer srv.Close()
	c := New(Options{APIKey: "rgsa_test_abc", BaseURL: srv.URL, FlushAt: 10, FlushInterval: time.Hour})
	out := "hello"
	c.Trace(Trace{Model: "gpt-4o-mini", Provider: OpenAI, InputMessages: []Message{{Role: "user", Content: "hi"}}, OutputText: &out})
	if err := c.Flush(context.Background()); err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || len(got[0].Traces) != 1 {
		t.Fatalf("expected one batch with one trace, got %+v", got)
	}
	if keys[0] != "rgsa_test_abc" {
		t.Fatalf("missing key header: %q", keys[0])
	}
	tr := got[0].Traces[0]
	if tr["id"] == "" || tr["status"] != "success" || got[0].SDK["name"] != SDKName {
		t.Fatalf("unexpected trace %+v", tr)
	}
}

func TestSpanRecordsLatencyTemplateAndErrors(t *testing.T) {
	var got []captured
	var keys []string
	srv := server(t, 202, &got, &keys)
	defer srv.Close()
	c := New(Options{APIKey: "k", BaseURL: srv.URL, FlushInterval: time.Hour, DefaultMetadata: map[string]interface{}{"env": "test"}})
	msgs := []Message{{Role: "system", Content: "You are a ping bot."}, {Role: "user", Content: "ping"}}
	c.Start("gpt-4o-mini", OpenAI, msgs, WithTemplate("ping", "You are a ping bot."), WithMetadata(map[string]interface{}{"user": "u1"})).End("pong", 5, 1, nil)
	c.Start("gpt-4o", OpenAI, msgs).End("", 0, 0, errors.New("429 rate limited"))
	_ = c.Flush(context.Background())
	ok := got[0].Traces[0]
	if ok["output_text"] != "pong" || ok["prompt_tokens"].(float64) != 5 || ok["prompt_template"].(map[string]interface{})["name"] != "ping" {
		t.Fatalf("bad success trace %+v", ok)
	}
	if md := ok["metadata"].(map[string]interface{}); md["env"] != "test" || md["user"] != "u1" {
		t.Fatalf("metadata not merged: %+v", md)
	}
	bad := got[0].Traces[1]
	if bad["status"] != "error" || bad["error_message"] != "429 rate limited" || bad["prompt_template"].(map[string]interface{})["raw"] != "You are a ping bot." {
		t.Fatalf("bad error trace %+v", bad)
	}
	if _, has := bad["latency_ms"]; !has {
		t.Fatal("latency missing")
	}
}

func TestFlushAtTriggersSend(t *testing.T) {
	var got []captured
	var keys []string
	srv := server(t, 202, &got, &keys)
	defer srv.Close()
	c := New(Options{APIKey: "k", BaseURL: srv.URL, FlushAt: 2, FlushInterval: time.Hour})
	c.Trace(Trace{Model: "m", Provider: Other, InputMessages: []Message{{Role: "user", Content: "1"}}})
	c.Trace(Trace{Model: "m", Provider: Other, InputMessages: []Message{{Role: "user", Content: "2"}}})
	_ = c.Shutdown(context.Background())
	if len(got) != 1 || len(got[0].Traces) != 2 {
		t.Fatalf("expected auto flush of 2 traces, got %+v", got)
	}
}

func TestRetriesOnServerErrorAndReportsOnce(t *testing.T) {
	var hits int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { atomic.AddInt32(&hits, 1); w.WriteHeader(503) }))
	defer srv.Close()
	var reported int
	c := New(Options{APIKey: "k", BaseURL: srv.URL, FlushInterval: time.Hour, OnError: func(error) { reported++ }})
	c.Trace(Trace{Model: "m", Provider: Other, InputMessages: []Message{{Role: "user", Content: "x"}}})
	if err := c.Flush(context.Background()); err == nil {
		t.Fatal("expected error")
	}
	if atomic.LoadInt32(&hits) != 4 || reported != 1 {
		t.Fatalf("hits=%d reported=%d", hits, reported)
	}
}

func TestDisabledClientSendsNothing(t *testing.T) {
	var got []captured
	var keys []string
	srv := server(t, 202, &got, &keys)
	defer srv.Close()
	c := New(Options{APIKey: "k", BaseURL: srv.URL, Disabled: true})
	c.Trace(Trace{Model: "m", Provider: Other})
	_ = c.Shutdown(context.Background())
	if len(got) != 0 {
		t.Fatal("disabled client sent traces")
	}
}
