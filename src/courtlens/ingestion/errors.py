class ProviderError(RuntimeError):
    """Base error for a visible upstream-provider failure."""


class ProviderAuthenticationError(ProviderError):
    """The provider rejected or did not receive a credential."""


class ProviderEntitlementError(ProviderError):
    """The credential lacks access to a requested paid endpoint."""


class ProviderRateLimitError(ProviderError):
    """The provider continued to rate-limit after bounded retries."""


class ProviderSchemaError(ProviderError):
    """A response no longer matches the recorded source contract."""
