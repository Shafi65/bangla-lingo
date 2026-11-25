import type { Metadata } from "next";
import { Shop } from "@/components/game/Shop";

export const metadata: Metadata = { title: "The shop · BanglaLingo" };

export default function ShopPage() {
  return <Shop />;
}
