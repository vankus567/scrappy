import { EmptyState } from "@/components/app/EmptyState";

export default function Jobs() {
  return (
    <EmptyState
      mood="curious"
      title="No jobs yet"
      body="Paid jobs appear here when the first AI teams go live. Each one takes about 20 seconds and pays in dollars within seconds."
    />
  );
}
