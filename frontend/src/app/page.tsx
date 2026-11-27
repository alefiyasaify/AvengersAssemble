import { SystemStatusCard } from "@/features/system-status";
import { publicEnv } from "@/shared/config/env";

export default function HomePage() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">{publicEnv.NEXT_PUBLIC_APP_NAME}</h1>
        <p className="text-muted-foreground">
          Frontend skeleton. The card below checks the backend through the same-origin API proxy.
        </p>
      </div>
      <SystemStatusCard />
    </div>
  );
}
