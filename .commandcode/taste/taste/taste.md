# Taste
- Prefers using the dedicated Supabase and Cloudflare plugins/connections (MCP-style integrations) when working with those services, rather than generic/manual access. Confidence: 0.7
- On debugging/"what's going on" requests, wants a thorough root-cause investigation and a clear diagnosis/report up front, and expects the agent to hold off on code changes until asked. Confidence: 0.6
- Pushes back when the agent asserts behavior the code doesn't actually have; expects claims about existing behavior to be verified against the real code first. Confidence: 0.5
- Prefers a design that makes the feature reliably succeed within hard platform constraints (e.g. staying inside a CPU/limit budget by moving work off the constrained runtime) over one that leans on fallback or "grace overage" paths. Confidence: 0.6
- Wants the agent to decide and implement the best overall solution itself ("do the BEST thing") rather than presenting a menu of options and waiting for a pick. Confidence: 0.5
- Insists that a fix/refactor must not regress the quality of the current user-visible output; quality preservation is a hard requirement of any solution. Confidence: 0.5
