"use client";
// Account UI, loaded as separate chunks and only when accounts are configured. With the flag off
// these render nothing and the account code is never downloaded.
import dynamic from "next/dynamic";
import { ACCOUNTS_ENABLED } from "@/lib/auth/config";

const AccountRuntime = dynamic(() => import("./AccountRuntime").then((m) => m.AccountRuntime), { ssr: false });
const AccountSection = dynamic(() => import("./AccountSection").then((m) => m.AccountSection), {
  ssr: false,
  loading: () => <div aria-hidden className="card h-40 p-5" />,
});
const ProfileAccountCard = dynamic(() => import("./ProfileAccountCard").then((m) => m.ProfileAccountCard), { ssr: false });
const SavePrompt = dynamic(() => import("./SavePrompt").then((m) => m.SavePrompt), { ssr: false });

export function AccountRuntimeSlot() {
  return ACCOUNTS_ENABLED ? <AccountRuntime /> : null;
}
export function AccountSectionSlot() {
  return ACCOUNTS_ENABLED ? <AccountSection /> : null;
}
export function ProfileAccountSlot() {
  return ACCOUNTS_ENABLED ? <ProfileAccountCard /> : null;
}
export function SavePromptSlot() {
  return ACCOUNTS_ENABLED ? <SavePrompt /> : null;
}
