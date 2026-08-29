import { createFileRoute } from "@tanstack/react-router";
import { BatchWorkbench } from "@/components/batch/batch-workbench";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <BatchWorkbench />;
}
