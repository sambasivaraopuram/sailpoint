# Multi-User Comma Search Plugin for SailPoint IdentityIQ

## Overview

This plugin extends the out-of-the-box LCM **Request Access** page with a bulk identity lookup widget. Users can paste comma-separated usernames, display names, emails, or employee IDs and resolve them all at once, then add them to an access request in a single action.

**Compatible with:** IIQ 8.0 – 8.5

---

## Features

- **Multi-token input** — comma, semicolon, or newline separated
- **Smart resolution chain** — username → display name → email → employee ID → partial match
- **Deduplication** — same identity entered twice is resolved once
- **Inactive flagging** — inactive identities shown with a warning badge and unchecked by default
- **Bulk add** — push all selected identities into the OOB request in one click
- **Health endpoint** — `GET /plugin/rest/multi-user-search/health` for monitoring
- **Input cap** — configurable max tokens (default 200) to prevent abuse
- **XSS-safe** — all rendered values are HTML-escaped

---

## Project Structure

```
multi-user-search-plugin/
├── manifest.xml                          Plugin descriptor
├── build.sh                              Compile + package script
├── README.md                             This file
├── src/
│   └── com/custom/plugin/
│       └── MultiUserSearchResource.java  REST endpoint
├── ui/
│   ├── js/
│   │   └── multi-user-search.js          Injected widget (JS)
│   └── css/
│       └── multi-user-search.css         Widget styles
├── build/                                (generated) compiled classes
└── lib/                                  (generated) plugin JAR
```

---

## Build

### Prerequisites

- **Java 8+ JDK** (javac, jar)
- **IIQ_HOME** environment variable pointing to the IdentityIQ webapp root  
  e.g. `export IIQ_HOME=/opt/tomcat/webapps/identityiq`

### Steps

```bash
chmod +x build.sh
export IIQ_HOME=/opt/tomcat/webapps/identityiq
./build.sh
```

This will:
1. Compile `MultiUserSearchResource.java` against the IIQ classpath
2. Package it into `lib/multi-user-search.jar`
3. Create `multi-user-search-plugin.zip` ready for deployment

---

## Deploy

1. Log in to IIQ as **spadmin**
2. Navigate to **Settings → Plugins**
3. Click **New** and upload `multi-user-search-plugin.zip`
4. Enable the plugin
5. Clear your browser cache
6. Navigate to **Manage Access → Request Access**

The bulk lookup widget appears at the top of the page.

---

## Usage

1. Paste or type identities into the text area:
   ```
   jsmith, Jane Doe, mjones@company.com, 100234
   ```
2. Click **Resolve** (or press Ctrl+Enter)
3. Review the results table — found identities are pre-checked, inactive ones are not
4. Uncheck any you don't want
5. Click **Add Selected to Request**
6. Continue with the standard role/entitlement selection as usual

---

## Configuration

### REST endpoint URL

If your IIQ context path is not `/identityiq`, update the `CONFIG.restUrl` value in `ui/js/multi-user-search.js`:

```javascript
restUrl: '/your-context-path/plugin/rest/multi-user-search/resolve',
```

### CSS selectors

The widget needs to find two things on the page:

1. **The page container** — where to inject the widget
2. **The OOB search input** — for the typeahead fallback strategy

If your IIQ theme or version uses different selectors, update:
- `CONFIG.containerSelectors` — for the page container
- `CONFIG.searchInputSelectors` — for the search input

Use browser DevTools to inspect your Request Access page and find the correct selectors.

### Token limit

The REST endpoint caps input at 200 tokens by default. Change `MAX_TOKENS` in `MultiUserSearchResource.java`:

```java
private static final int MAX_TOKENS = 200;
```

### Authorization

The endpoint currently uses `@AllowAll`. For production, replace with:

```java
@RequiredRight("ViewRequestAccess")
```

### Resolution chain

In `MultiUserSearchResource.java`, the `resolveIdentity()` method tries five strategies in order. You can add, remove, or reorder them. For example, to add SAMAccountName lookup:

```java
// After the employeeId check:
id = findSingle(ctx, Filter.ignoreCase(Filter.eq("sAMAccountName", token)));
if (id != null) return id;
```

---

## Integration Strategies

The widget uses two strategies to push resolved identities into the OOB UI:

### Strategy A: Angular Scope Injection (preferred)

Reaches into the Angular controller's scope and calls the identity-add method directly. This is instantaneous and the cleanest approach. The JS tries several common method and array names across IIQ versions.

### Strategy B: Typeahead Simulation (fallback)

If Angular injection fails, the widget programmatically types each username into the OOB search input, waits for the typeahead dropdown, and clicks the first suggestion. This is sequential and slower but works regardless of Angular internals.

Timing constants for Strategy B can be adjusted in `CONFIG`:
- `typeaheadDelay` — ms to wait for the dropdown (default 800)
- `betweenUsers` — ms between sequential users (default 900)

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Widget doesn't appear | Check plugin is enabled. Check browser console for JS errors. Verify `containerSelectors` match your page. |
| REST returns 404 | Verify `manifest.xml` has correct class name. Check JAR is in `lib/`. Restart Tomcat. |
| XSRF 403 error | Inspect cookie name — update `getXsrfToken()` patterns if your IIQ uses a different cookie name. |
| Typeahead doesn't click | Increase `typeaheadDelay`. Inspect the suggestion dropdown and update the CSS selector. |
| "Not resolved" for valid users | Check the resolution chain order. Add logging to `resolveIdentity()`. Verify the identity attribute being matched. |

---

## Health Check

```bash
curl -s -b cookies.txt \
  https://your-iiq-host/identityiq/plugin/rest/multi-user-search/health | python -m json.tool
```

Expected response:
```json
{
    "status": "ok",
    "plugin": "MultiUserSearchPlugin",
    "version": "1.0",
    "maxTokens": 200
}
```

---

## License

Internal use. Modify freely for your SailPoint IdentityIQ deployment.
