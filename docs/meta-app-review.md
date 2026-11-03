# Meta App Review: permissions and setup checklist

Production readiness, item 7. Derived from the Graph calls the code actually makes (file references below). Meta's dashboard is the source of truth for what is granted; this lists what the code needs. Request **Advanced Access** for each, so accounts other than your own (app roles) can connect.

## Instagram (Instagram API with Facebook Login, the default `META_IG_LOGIN_MODE=facebook`)

| Permission | Why the app needs it | Where |
|---|---|---|
| `instagram_basic` | Read the linked Instagram professional account (`instagram_business_account{id,username}`) | `lib/meta-instagram-facebook-flow.ts` |
| `instagram_manage_messages` | Receive Instagram DMs (webhook) and reply (`POST /<PAGE_ID>/messages`, incl. `mark_seen` / `typing_on`) | `lib/instagram-delivery.ts` |
| `pages_show_list` | List the person's Pages (`GET /me/accounts`) to find the one linked to Instagram | `lib/meta-instagram-facebook-flow.ts` |
| `pages_manage_metadata` | Subscribe our app to the Page (`POST /<PAGE_ID>/subscribed_apps`, `subscribed_fields=feed`) — without it Meta never delivers Instagram DMs — and the 6-hourly health check that re-subscribes if it was removed (`GET/POST /<PAGE_ID>/subscribed_apps`) | `lib/meta-instagram-facebook-flow.ts`, `lib/instagram-health.ts` |
| `pages_read_engagement` | Read the Page node and its Page access token (`GET /<PAGE_ID>?fields=…`) when the person picks a Page | `lib/meta-instagram-facebook-flow.ts` |
| `business_management` | Pages owned through a Business Manager only appear in `/me/accounts` with this | `lib/meta-instagram-facebook-flow.ts` |

**Not requested, deliberately:** `pages_messaging` (that's Facebook Page DMs; we don't handle them — see STATE.md 2026-11-02, PR #143).

### Facebook Login configuration (`META_LOGIN_CONFIG_ID`)
Must contain all six permissions above. Redirect URI: `https://aipilot.waveswebstudio.in/api/meta/instagram/callback` (must equal `META_REDIRECT_URI`).

### Webhooks (App Dashboard → Webhooks → **Instagram** object)
- Callback: `https://aipilot.waveswebstudio.in/api/meta/instagram/webhook`, verify token = `META_WEBHOOK_VERIFY_TOKEN`
- Fields: `messages`, `messaging_postbacks`, `message_reactions`, `messaging_seen`
- Signed with the app secret (`META_APP_SECRET`); unsigned/invalid requests get 401.

### Data deletion / deauthorize callbacks
- Deauthorize: `https://aipilot.waveswebstudio.in/api/meta/deauthorize`
- Data deletion: `https://aipilot.waveswebstudio.in/api/meta/data-deletion`
- Privacy policy: `https://aipilot.waveswebstudio.in/privacy`; data deletion instructions: `/data-deletion`

### Token lifetime (for the reviewer's "how do you store tokens" question)
The Page token is derived from a long-lived User token, so it has no expiry date and no refresh endpoint. It is AES-256-GCM encrypted at rest (`lib/token-crypto.ts`), sent only in the `Authorization` header, never logged, and deleted on disconnect, deauthorize, data deletion or business deletion. A health check every 6 hours (`lib/instagram-health.ts`) detects a revoked token or removed Page subscription, marks the account disconnected and emails the owner to reconnect.

### Screencast for review
Show: business signs in → Instagram page → "Before you connect" steps → Connect → Facebook login → choose Page/Instagram account → approve → a DM from a test account → the AI reply in Instagram → the conversation in the dashboard inbox → Disconnect.

## WhatsApp (Cloud API, our app's webhook)

| Permission | Why |
|---|---|
| `whatsapp_business_messaging` | Receive messages on our webhook and send replies/templates (`POST /<PHONE_NUMBER_ID>/messages`) — `lib/whatsapp-delivery.ts` |
| `whatsapp_business_management` | Only if we later create templates or read WABA details via API. Today templates are submitted by hand in WhatsApp Manager, so this can wait. |

Each connected business's WABA must also be subscribed to our app and have the templates in `lib/whatsapp-templates.ts` approved (see LAUNCH_AUDIT.md handoff).

## Also required before going Live
Business Verification, App Mode = Live, and the WhatsApp display name approved for each number.
