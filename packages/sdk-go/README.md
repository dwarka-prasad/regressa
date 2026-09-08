# regressa-go

```go
import regressa "github.com/dwarka-prasad/regressa-go"

client := regressa.New(regressa.Options{}) // reads REGRESSA_API_KEY, REGRESSA_BASE_URL
defer client.Shutdown(context.Background())

msgs := []regressa.Message{{Role: "system", Content: prompt}, {Role: "user", Content: q}}
span := client.Start("gpt-4o-mini", regressa.OpenAI, msgs, regressa.WithTemplate("support-agent", promptTemplate))
resp, err := openaiClient.CreateChatCompletion(ctx, req)
if err != nil { span.End("", 0, 0, err); return err }
span.End(resp.Choices[0].Message.Content, resp.Usage.PromptTokens, resp.Usage.CompletionTokens, nil)
```

`go test ./...`
