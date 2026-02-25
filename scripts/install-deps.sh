#!/bin/sh

# simple helper for developers to install the handful of system packages
# the backend build requires (openssl headers, pkg-config, etc.).  Add other
# packages here as they become necessary.

set -eu

install_debian() {
    echo "Detected Debian/Ubuntu; installing via apt..."
    sudo apt-get update
    sudo apt-get install -y libssl-dev pkg-config
}

install_fedora() {
    echo "Detected Fedora/RHEL; installing via dnf..."
    sudo dnf install -y openssl-devel pkgconf-pkg-config
}

if command -v apt-get >/dev/null 2>&1; then
    install_debian
elif command -v dnf >/dev/null 2>&1; then
    install_fedora
else
    cat <<'EOF' >&2
Unsupported or unknown distribution.  Please install the following
packages manually:

  * OpenSSL development headers (e.g. libssl-dev/openssl-devel)
  * pkg-config

Refer to your distro's package manager for the correct package names.
EOF
    exit 1
fi
