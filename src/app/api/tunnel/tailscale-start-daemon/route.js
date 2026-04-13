"use server";

import { NextResponse } from "next/server";

import { getSettings, updateSettings } from "@/lib/localDb";
import { startDaemonWithPassword } from "@/lib/tunnel/tailscale";
import {
  getCachedPassword,
  initDbHooks,
  loadEncryptedPassword,
} from "@/mitm/manager";

initDbHooks(getSettings, updateSettings);

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    // Use provided password, or fall back to cached/stored MITM password
    const password =
      body.sudoPassword ||
      getCachedPassword() ||
      (await loadEncryptedPassword()) ||
      "";
    await startDaemonWithPassword(password);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Tailscale start daemon error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
