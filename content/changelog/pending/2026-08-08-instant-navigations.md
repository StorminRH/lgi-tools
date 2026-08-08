---
date: 2026-08-08
source: stormin/next-163-instant-nav-f2e1
---

#### Changed
- Page navigation is faster: every route now shares an instantly prefetched shell, so headers, page titles, and content skeletons paint immediately while account data streams in.
- The changelog and dev-log browsers keep their document rail and heading in place while switching documents, and unknown document links render the not-found page marked no-index instead of a bare error status.

#### Fixed
- The dev log's server-side cache no longer exceeds the shared remote cache's size limit in production.
