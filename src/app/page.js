// Auto-initialize cloud sync when server starts
import { redirect } from "next/navigation";

import "@/lib/initCloudSync";

export default function InitPage() {
  redirect("/dashboard");
}
