#!/usr/bin/env bash
# Approved and executed on 2026-10-09 (Asia/Shanghai); local SSH verified as root.
set -euo pipefail
[[ "$(id -u)" -eq 0 ]] || { printf '%s\n' 'Run as root'; exit 1; }
[[ ! -L /root/.ssh && ! -L /root/.ssh/authorized_keys ]] || { printf '%s\n' 'Refusing to change symlinked SSH paths'; exit 1; }
install -d -m 700 /root/.ssh
[[ ! -e /root/.ssh/authorized_keys || -f /root/.ssh/authorized_keys ]] || exit 1
touch /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys
public_key='ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIG0M0DQ+rAN9cNRL4Hgp8YwJbV88JZrE2wAhGDOtbCz6 readytogo-deploy-47.85.138.198'
if ! grep -qxF -- "$public_key" /root/.ssh/authorized_keys; then
  printf '\n%s\n' "$public_key" >> /root/.ssh/authorized_keys
fi
printf '%s\n' 'ReadytoGo public key is present'
