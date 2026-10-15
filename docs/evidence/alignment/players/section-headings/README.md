# Section headings below the career table

Owner instruction 59, 2026-10-15. The five glass sections below the career table (Player Impact,
Recent Form, Contract, Transactions, Career Highs) now have 20 px headings (`--text-xl`, up from
16 px), each with a 20 px Lucide icon: Activity, TrendingUp, Banknote, ArrowLeftRight and Trophy.
The hairline under each heading is gone. The icons follow the heading's text color, per the icon
wrapper's rule. Section headings on the Tracking and Combine tabs are unchanged.

A production sandbox build read Kawhi Leonard (202695) through a read-only GET proxy. At 1440 and
390, every one of the five headings measures 20 px, has an icon and a 0 px bottom border. There
were no page errors, and the page width equals the viewport.

| View | Desktop | Phone |
| --- | --- | --- |
| Player Impact and Recent Form | [1440](impact-form-1440.png) | [390](impact-form-390.png) |
| Transactions | [1440](transactions-1440.png) | [390](transactions-390.png) |

Dashboard lint, typecheck and all 527 Vitest tests pass. Owner alignment is still pending.
