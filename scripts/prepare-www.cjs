#!/usr/bin/env node
/**
 * Copy static PWA assets into www/ for Capacitor (webDir).
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const www = path.join(root, "www");

function rimraf(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

function copy(src, dest) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      copy(path.join(src, name), path.join(dest, name));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

rimraf(www);
fs.mkdirSync(www, { recursive: true });

const files = [
  "index.html",
  "manifest.webmanifest",
  "sw.js",
  "css",
  "js",
  "data",
  "icons",
];

for (const f of files) {
  const src = path.join(root, f);
  if (!fs.existsSync(src)) {
    console.warn("skip missing", f);
    continue;
  }
  copy(src, path.join(www, f));
}

console.log("Prepared www/ for Capacitor");
