✔ public routes expose only the five UI assets (6.9161ms)
✔ admin is disabled when its password is unset (1.4963ms)
✔ admin accepts a password containing a colon and rejects a wrong password (1.373ms)
✔ conversation logging requires explicit opt-in (2.4335ms)
✔ unknown origins are rejected; own origin, configured origin and no origin pass (1.5886ms)
✔ proxy headers are not trusted by default; configuration is validated (4.2791ms)
✔ chat rejects malformed, oversized and invalid-role payloads before contacting providers (1.7028ms)
✔ history fetches the newest bounded window then restores conversation order (1.9756ms)
✔ source links reject script protocols and render untrusted titles as text (1.0968ms)
✔ Enter cannot start another request during generation (0.8759ms)
✔ account messages are not copied into guest localStorage (0.7031ms)
✔ SSE parses fragmented UTF-8 and completes only on an explicit done event (2.0609ms)
✔ SSE premature EOF is reported as an error (0.9978ms)
✔ SSE server errors preserve their user-facing message (1.1067ms)
✔ shared query-string encoding preserves base64 plus signs (0.1415ms)
ℹ tests 15
ℹ suites 0
ℹ pass 15
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 118.6203
