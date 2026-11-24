#!/bin/bash
set -euo pipefail
if [[ "$(uname -s)" != Darwin ]]; then
  echo 'This check requires a Mac running the Ovelle app.' >&2
  exit 1
fi
capture_dir=$(mktemp -d "${TMPDIR:-/tmp}/ovelle-window-check.XXXXXX")
trap 'rm -rf "$capture_dir"' EXIT
/usr/bin/open -b com.ovelle.desktop
sleep 1
# AppKit identifies the foreground Ovelle process; CoreGraphics locates its
# visible native window rather than capturing a browser approximation.
window_id=$(/usr/bin/swift -e '
import AppKit
import CoreGraphics
import Foundation
let active = NSWorkspace.shared.frontmostApplication
 guard active?.bundleIdentifier == "com.ovelle.desktop", let pid = active?.processIdentifier else {
  fputs("Bring Ovelle to the front before running the visual check.\n", stderr); exit(1)
}
guard let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else { exit(1) }
let matches = windows.filter { item in
  guard let owner = item[kCGWindowOwnerPID as String] as? Int32, owner == pid,
        let layer = item[kCGWindowLayer as String] as? Int, layer == 0,
        let raw = item[kCGWindowBounds as String] as? [String: Any],
        let rect = CGRect(dictionaryRepresentation: raw as CFDictionary) else { return false }
  return rect.width >= 640 && rect.height >= 480
}
guard matches.count == 1, let id = matches.first?[kCGWindowNumber as String] as? Int else {
  fputs("Expected one visible Ovelle window.\n", stderr); exit(1)
}
print(id)
')
if ! /usr/sbin/screencapture -x -o -l "$window_id" "$capture_dir/window.png" || [[ ! -s "$capture_dir/window.png" ]]; then
  echo 'Could not capture the Ovelle window. Grant macOS Screen Recording access to the process running this check and retry.' >&2
  exit 1
fi
node scripts/check-macos-window-visual.mjs "$capture_dir/window.png"
