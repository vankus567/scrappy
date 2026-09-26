import { redirect } from "next/navigation";

// Scrappy is a battle game now; old job links land on battles.
export default function Jobs() {
  redirect("/app/battle");
}
