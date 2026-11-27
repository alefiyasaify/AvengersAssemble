import { z } from "zod";

// Mirror the backend's Create schema limits for instant feedback; the backend stays authoritative.
export const exampleFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200, "Name is too long"),
});

export type ExampleFormValues = z.infer<typeof exampleFormSchema>;
