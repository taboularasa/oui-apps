# Render static-site routing

OUI applications use browser-history URLs generated from the canonical route
contract. A direct request for a nested URL such as
`/items/item%3A42/edit` must serve the application entry point so TanStack Router
can validate and render the route client-side.

Configure the Render static site with this rewrite:

```yaml
routes:
  - type: rewrite
    source: /*
    destination: /index.html
```

This is a rewrite, not a redirect: the browser retains the canonical nested URL.
The generated route adapter then validates path and search parameters before it
loads the interaction module. API and Connect traffic belongs on the BFF origin
and must not be captured by this static-site rule.
