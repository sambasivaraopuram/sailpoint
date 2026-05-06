#!/bin/bash
# ============================================================================
#  build.sh — Compile and package the Multi-User Search Plugin
# ============================================================================
#
#  Prerequisites:
#    - Java 8+ (JDK)
#    - IIQ_HOME set to your IdentityIQ webapp directory
#      e.g.  export IIQ_HOME=/opt/tomcat/webapps/identityiq
#
#  Usage:
#    chmod +x build.sh
#    ./build.sh
#
# ============================================================================

set -e

# ── Validate IIQ_HOME ──
if [ -z "$IIQ_HOME" ]; then
    echo "ERROR: IIQ_HOME is not set."
    echo "  export IIQ_HOME=/opt/tomcat/webapps/identityiq"
    exit 1
fi

if [ ! -d "$IIQ_HOME/WEB-INF/lib" ]; then
    echo "ERROR: $IIQ_HOME/WEB-INF/lib does not exist."
    echo "  Verify IIQ_HOME points to the IdentityIQ webapp root."
    exit 1
fi

PLUGIN_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$PLUGIN_DIR/build"
LIB_DIR="$PLUGIN_DIR/lib"
OUTPUT="$PLUGIN_DIR/multi-user-search-plugin.zip"

echo "=== Multi-User Search Plugin Build ==="
echo "  IIQ_HOME:   $IIQ_HOME"
echo "  Plugin dir: $PLUGIN_DIR"
echo ""

# ── Clean ──
rm -rf "$BUILD_DIR" "$LIB_DIR/multi-user-search.jar" "$OUTPUT"
mkdir -p "$BUILD_DIR" "$LIB_DIR"

# ── Compile ──
echo "[1/3] Compiling Java sources..."
javac \
    -source 1.8 -target 1.8 \
    -cp "$IIQ_HOME/WEB-INF/lib/*:$IIQ_HOME/WEB-INF/classes" \
    -d "$BUILD_DIR" \
    "$PLUGIN_DIR/src/com/custom/plugin/MultiUserSearchResource.java"

echo "      Compiled successfully."

# ── JAR ──
echo "[2/3] Packaging JAR..."
cd "$BUILD_DIR"
jar cf "$LIB_DIR/multi-user-search.jar" com/
cd "$PLUGIN_DIR"
echo "      Created lib/multi-user-search.jar"

# ── ZIP ──
echo "[3/3] Assembling plugin ZIP..."
cd "$PLUGIN_DIR"
zip -r "$OUTPUT" \
    manifest.xml \
    lib/multi-user-search.jar \
    ui/js/multi-user-search.js \
    ui/css/multi-user-search.css

echo ""
echo "=== BUILD COMPLETE ==="
echo "  Output: $OUTPUT"
echo ""
echo "  Deploy:"
echo "    1. Log in to IIQ as spadmin"
echo "    2. Settings → Plugins → New"
echo "    3. Upload $OUTPUT"
echo "    4. Enable the plugin"
echo "    5. Clear browser cache, navigate to Request Access"
echo ""
