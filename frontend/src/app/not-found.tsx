import Link from "next/link";

import { buttonVariants, Card, CardDescription, CardTitle } from "@/shared/ui";

export default function NotFound() {
  return (
    <Card className="space-y-4">
      <CardTitle>Page not found</CardTitle>
      <CardDescription>The page you are looking for does not exist or has moved.</CardDescription>
      <Link href="/" className={buttonVariants({ variant: "secondary" })}>
        Back to home
      </Link>
    </Card>
  );
}
