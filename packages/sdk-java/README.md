# regressa-sdk (Java)

```xml
<dependency><groupId>dev.regressa</groupId><artifactId>regressa-sdk</artifactId><version>0.1.0</version></dependency>
```

```java
Regressa regressa = Regressa.builder().build(); // reads REGRESSA_API_KEY, REGRESSA_BASE_URL

Regressa.Span span = regressa.start("gpt-4o-mini", "openai")
    .message("system", prompt).message("user", question)
    .template("support-agent", PROMPT_TEMPLATE);
try {
  ChatCompletion res = openai.chat().completions().create(req);
  span.end(res.choices().get(0).message().content(), res.usage().promptTokens(), res.usage().completionTokens());
} catch (Exception e) {
  span.fail(e); throw e;
}
regressa.shutdown();
```

Requires Java 17. `mvn test`.
