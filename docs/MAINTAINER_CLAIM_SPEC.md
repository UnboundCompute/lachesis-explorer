# Maintainer claim and verification contract

This contract defines the trusted boundary needed before Explorer may label a curated tour as
verified publisher context. It is intentionally provider-neutral: GitHub OAuth, GitLab OAuth,
Bitbucket OAuth, or an equivalent signed service may implement the identity step later.

## Security invariant

The curated-tour maintainer verified flag may only be written by the hosted service after it
has authenticated a human or organization and confirmed that identity can administer the exact
canonical repository being claimed. A bundle producer, README badge, repository name, or browser
client must never be able to set or upgrade this flag.

## Required flow

1. The user starts a claim for an accepted canonical repository identity
   (host/owner/repository). The service creates a short-lived, single-use state value bound to
   the authenticated session and the requested repository.
2. The identity provider authenticates the user and returns to the service callback. The service
   validates state, issuer, redirect URI, nonce, and the provider response before creating a
   session. Tokens are kept server-side and are never placed in a bundle or browser URL.
3. The service checks repository administration/ownership permission through the provider API,
   using the exact host, owner, and repository from the claim request. Read access alone is not
   sufficient.
4. The user confirms the claim. The service stores a claim record keyed by canonical repository
   identity and provider subject, with the provider, subject identifier, granted permission,
   verification timestamp, and revocation/expiry state.
5. Only a service-side build or publish operation may derive verified maintainer metadata from an
   active claim. It may include a display name and safe HTTPS profile/repository URL, but must
   not copy arbitrary maintainer fields from an uploaded bundle.
6. Revocation, permission loss, provider unlinking, or claim replacement invalidates the trusted
   state. Future published bundles must omit verified metadata; previously published artifacts
   retain their original provenance timestamp but must not be presented as currently verified if
   the index marks the claim revoked.

## Minimum service records

    claim_id
    canonical_repository      # host/owner/repository
    provider
    provider_subject          # opaque provider identifier
    permission                # exact provider permission observed
    verified_at
    checked_at
    status                    # active | revoked | expired
    display_name              # provider-derived, optional
    profile_url               # provider-derived HTTPS URL, optional

Do not store access tokens in repository-index records or bundle metadata. Do not expose provider
subject identifiers, tokens, storage keys, or internal claim IDs to the public gallery.

## API shape

The eventual hosted service should expose behavior equivalent to:

    POST /api/claims/start
    GET  /api/claims/callback
    POST /api/repos/{host}/{owner}/{repo}/claim
    GET  /api/repos/{host}/{owner}/{repo}/claim
    DELETE /api/repos/{host}/{owner}/{repo}/claim

The first endpoint returns an authorization URL plus opaque state. The callback creates an
authenticated session but does not claim a repository. Public claim responses should only disclose
whether the repository has an active verified maintainer and the safe display/link fields intended
for curated-tour attribution.

## Offline acceptance tests

The service must be testable without provider credentials, network access, AWS, or a deployed API:

- valid signed/mock identity plus exact admin permission creates an active claim;
- read-only permission, wrong repository, invalid issuer, expired state, replayed state, and
  revoked permission are rejected;
- bundle metadata cannot create or upgrade a claim;
- a published tour receives verified metadata only when an active claim exists;
- revocation removes verified metadata from the next publication and public status is non-sensitive;
- public repository index responses never contain tokens, provider subjects, or internal claim IDs.

Until this contract is implemented and its trusted checks are covered by service tests, Explorer
must continue to render the existing publisher-provided tour wording and must not claim
authenticated ownership.
