#!/usr/bin/env bash
set -euo pipefail

KUBEFORGE_REPO_OWNER="${KUBEFORGE_REPO_OWNER:-ztr1566}"
KUBEFORGE_REPO_NAME="${KUBEFORGE_REPO_NAME:-kubeforge}"
KUBEFORGE_INSTALL_DIR="${KUBEFORGE_INSTALL_DIR:-/usr/local/bin}"
KUBEFORGE_BINARY_NAME="${KUBEFORGE_BINARY_NAME:-kubeforge}"
GITHUB_API_BASE="${GITHUB_API_BASE:-https://api.github.com}"
GITHUB_RAW_BASE="${GITHUB_RAW_BASE:-https://raw.githubusercontent.com}"

TEMP_FILES=()

log() { printf '%s\n' "$*"; }
warn() { printf '%s\n' "$*" >&2; }
die() {
  warn "Error: $*"
  exit 1
}

register_temp() {
  TEMP_FILES+=("$1")
}

cleanup() {
  local f
  for f in "${TEMP_FILES[@]:-}"; do
    if [[ -n "${f:-}" && -e "${f}" ]]; then
      rm -f "${f}" 2>/dev/null || true
    fi
  done
}
trap cleanup EXIT

if [[ "${EUID}" -ne 0 ]]; then
  die "This installer must be run as root. Use: curl -fsSL ${GITHUB_RAW_BASE%/}/${KUBEFORGE_REPO_OWNER:-<owner>}/${KUBEFORGE_REPO_NAME}/main/install.sh | sudo bash"
fi

if ! command -v jq >/dev/null 2>&1; then
  die "jq is required. Install with: apt-get install -y jq"
fi

HTTP_CLIENT=""
if command -v curl >/dev/null 2>&1; then
  HTTP_CLIENT="curl"
elif command -v wget >/dev/null 2>&1; then
  HTTP_CLIENT="wget"
else
  die "curl or wget is required. Install with: apt-get install -y curl"
fi

ca_certificates_ok() {
  if command -v dpkg >/dev/null 2>&1; then
    if dpkg -l ca-certificates 2>/dev/null | grep -qE '^ii[[:space:]]+ca-certificates[[:space:]]'; then
      return 0
    fi
  fi
  if [[ "${HTTP_CLIENT}" == "curl" ]]; then
    if curl --silent --head --fail --max-time 10 https://github.com >/dev/null 2>&1; then
      return 0
    fi
  else
    if wget --quiet --spider --timeout=10 https://github.com >/dev/null 2>&1; then
      return 0
    fi
  fi
  return 1
}

if ! ca_certificates_ok; then
  die "ca-certificates is required for HTTPS. Install with: apt-get install -y ca-certificates"
fi

ARCH="$(uname -m)"
case "${ARCH}" in
  x86_64)
    ASSET_ARCH="amd64"
    ;;
  aarch64)
    ASSET_ARCH="arm64"
    ;;
  *)
    die "Unsupported architecture: ${ARCH}. Only x86_64 and aarch64 are supported."
    ;;
esac

ASSET_NAME="kubeforge-linux-${ASSET_ARCH}"
log "Detected architecture: ${ARCH} -> ${ASSET_NAME}"

if [[ -z "${KUBEFORGE_REPO_OWNER}" ]]; then
  die "KUBEFORGE_REPO_OWNER is not set. Configure it in install.sh or export KUBEFORGE_REPO_OWNER=<github-owner> before running."
fi

API_URL="${GITHUB_API_BASE%/}/repos/${KUBEFORGE_REPO_OWNER}/${KUBEFORGE_REPO_NAME}/releases/latest"

JSON_TMP="$(mktemp)"
register_temp "${JSON_TMP}"
ERR_TMP="$(mktemp)"
register_temp "${ERR_TMP}"

log "Querying GitHub Releases API for ${KUBEFORGE_REPO_OWNER}/${KUBEFORGE_REPO_NAME}..."

HTTP_STATUS=""
if [[ "${HTTP_CLIENT}" == "curl" ]]; then
  if ! HTTP_STATUS="$(curl --silent --show-error --location --max-time 30 \
       -o "${JSON_TMP}" \
       -w "%{http_code}" \
       -H "Accept: application/vnd.github+json" \
       -H "X-GitHub-Api-Version: 2022-11-28" \
       "${API_URL}" 2>"${ERR_TMP}")"; then
    if [[ -z "${HTTP_STATUS}" || "${HTTP_STATUS}" == "000" ]]; then
      warn "Error: Failed to reach GitHub API. Check your network connection."
      if [[ -s "${ERR_TMP}" ]]; then
        warn "  Details: $(cat "${ERR_TMP}")"
      fi
      exit 1
    fi
  fi
else
  if wget --no-verbose --output-document="${JSON_TMP}" --timeout=30 \
       --header="Accept: application/vnd.github+json" \
       --header="X-GitHub-Api-Version: 2022-11-28" \
       --server-response \
       "${API_URL}" >/dev/null 2>"${ERR_TMP}"; then
    HTTP_STATUS="200"
  else
    HTTP_STATUS="$(grep -oE 'HTTP/[0-9.]+ [0-9]+' "${ERR_TMP}" | tail -n1 | awk '{print $2}')"
    if [[ -z "${HTTP_STATUS}" ]]; then
      warn "Error: Failed to reach GitHub API. Check your network connection."
      if [[ -s "${ERR_TMP}" ]]; then
        warn "  Details: $(cat "${ERR_TMP}")"
      fi
      exit 1
    fi
  fi
fi

case "${HTTP_STATUS}" in
  200)
    ;;
  403)
    if grep -qi 'rate' "${JSON_TMP}" 2>/dev/null || grep -qi 'rate' "${ERR_TMP}" 2>/dev/null; then
      die "GitHub API rate limit exceeded. Wait and try again, or use a token for higher limits."
    fi
    die "GitHub API returned 403 Forbidden. Check your network connection."
    ;;
  404)
    die "No release found for ${KUBEFORGE_REPO_OWNER}/${KUBEFORGE_REPO_NAME}. Has any release been published?"
    ;;
  5*)
    die "GitHub API returned HTTP ${HTTP_STATUS} (server error). Try again later."
    ;;
  *)
    die "GitHub API returned HTTP ${HTTP_STATUS}. Check your network connection."
    ;;
esac

DOWNLOAD_URL=""
DOWNLOAD_URL="$(jq -r ".assets[] | select(.name==\"${ASSET_NAME}\") | .browser_download_url" < "${JSON_TMP}" | head -n1)" || true

if [[ -z "${DOWNLOAD_URL}" ]]; then
  die "No binary found for ${ARCH} in the latest release"
fi

if [[ "${DOWNLOAD_URL}" != https://* && "${KUBEFORGE_ALLOW_HTTP:-0}" != "1" ]]; then
  die "Resolved download URL is not HTTPS: ${DOWNLOAD_URL}"
fi

BINARY_TEMP_FILE="$(mktemp)"
register_temp "${BINARY_TEMP_FILE}"

log "Downloading ${ASSET_NAME} from latest release..."

if [[ "${HTTP_CLIENT}" == "curl" ]]; then
  if ! curl --silent --show-error --location --fail --max-time 300 \
       -o "${BINARY_TEMP_FILE}" \
       "${DOWNLOAD_URL}" 2>"${ERR_TMP}"; then
    warn "Error: Failed to download binary from ${DOWNLOAD_URL}"
    if [[ -s "${ERR_TMP}" ]]; then
      warn "  Details: $(cat "${ERR_TMP}")"
    fi
    exit 1
  fi
else
  if ! wget --no-verbose --output-document="${BINARY_TEMP_FILE}" --timeout=300 \
       "${DOWNLOAD_URL}" >/dev/null 2>"${ERR_TMP}"; then
    warn "Error: Failed to download binary from ${DOWNLOAD_URL}"
    if [[ -s "${ERR_TMP}" ]]; then
      warn "  Details: $(cat "${ERR_TMP}")"
    fi
    exit 1
  fi
fi

if [[ ! -s "${BINARY_TEMP_FILE}" ]]; then
  die "Downloaded file is empty. The binary asset may be missing or corrupt."
fi

# SHA-256 checksum verification
CHECKSUM_URL="${DOWNLOAD_URL}.sha256"
CHECKSUM_TMP="$(mktemp)"
register_temp "${CHECKSUM_TMP}"

log "Downloading checksum from ${CHECKSUM_URL}..."

if [[ "${HTTP_CLIENT}" == "curl" ]]; then
  if ! curl --silent --show-error --location --fail --max-time 60 \
       -o "${CHECKSUM_TMP}" \
       "${CHECKSUM_URL}" 2>"${ERR_TMP}"; then
    warn "Error: Failed to download checksum file from ${CHECKSUM_URL}"
    if [[ -s "${ERR_TMP}" ]]; then
      warn "  Details: $(cat "${ERR_TMP}")"
    fi
    exit 1
  fi
else
  if ! wget --no-verbose --output-document="${CHECKSUM_TMP}" --timeout=60 \
       "${CHECKSUM_URL}" >/dev/null 2>"${ERR_TMP}"; then
    warn "Error: Failed to download checksum file from ${CHECKSUM_URL}"
    if [[ -s "${ERR_TMP}" ]]; then
      warn "  Details: $(cat "${ERR_TMP}")"
    fi
    exit 1
  fi
fi

log "Verifying SHA-256 checksum..."
CHECKSUM_LINE="$(cat "${CHECKSUM_TMP}")"
# sha256sum -c expects "<hash>  <filename>" format
printf '%s  %s\n' "${CHECKSUM_LINE%% *}" "${BINARY_TEMP_FILE}" | sha256sum -c - >/dev/null 2>"${ERR_TMP}" || {
  die "SHA-256 checksum verification failed for ${ASSET_NAME}. The binary may be tampered or corrupt."
}
log "Checksum verified."

FILE_SIZE="$(stat -c%s "${BINARY_TEMP_FILE}" 2>/dev/null || echo '?')"
log "Download complete: ${ASSET_NAME} (${FILE_SIZE} bytes) -> ${BINARY_TEMP_FILE}"

TARGET="${KUBEFORGE_INSTALL_DIR%/}/${KUBEFORGE_BINARY_NAME}"

if [[ ! -d "${KUBEFORGE_INSTALL_DIR}" ]]; then
  mkdir -p "${KUBEFORGE_INSTALL_DIR}" 2>/dev/null || \
    die "Install directory ${KUBEFORGE_INSTALL_DIR} does not exist and could not be created. Create it with: mkdir -p ${KUBEFORGE_INSTALL_DIR}"
fi

log "Installing ${ASSET_NAME} to ${TARGET}..."

if ! mv -f "${BINARY_TEMP_FILE}" "${TARGET}"; then
  die "Failed to move binary to ${TARGET}. Check permissions on ${KUBEFORGE_INSTALL_DIR}."
fi

if ! chmod +x "${TARGET}"; then
  die "Failed to set executable permissions on ${TARGET}."
fi

log "Installed ${TARGET}"

VERSION_OUTPUT=""
if ! VERSION_OUTPUT="$("${TARGET}" --version 2>&1)"; then
  warn "Warning: Installation completed but version check failed. The binary may be corrupt."
  if [[ -n "${VERSION_OUTPUT}" ]]; then
    warn "  Output: ${VERSION_OUTPUT}"
  fi
  exit 1
fi

VERSION_STR="${VERSION_OUTPUT#kubeforge }"
VERSION_STR="${VERSION_STR#"${VERSION_STR%%[![:space:]]*}"}"
VERSION_STR="${VERSION_STR%"${VERSION_STR##*[![:space:]]}"}"
if [[ -z "${VERSION_STR}" ]]; then
  VERSION_STR="${VERSION_OUTPUT}"
fi

log "kubeforge ${VERSION_STR} installed successfully to ${TARGET}"
