import { redirect } from "next/navigation";

// HOP was the engine test. The game is TIDEPOOL.
export default function Play() {
  redirect("/tidepool");
}
