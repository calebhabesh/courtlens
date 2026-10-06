"""Read-only reproduction against retained identities at the freeze boundary."""

from pathlib import Path

import verify_pf07a_assistant as verifier

if __name__ == "__main__":
    verifier.DIRECTORY = Path("docs/evidence/pf09-freeze-acceptance")
    print(verifier.verify_retained())
