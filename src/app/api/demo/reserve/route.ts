import { handleDemoReserve } from "@/lib/demo/reserve-handler";

export async function POST(request: Request) {
  return handleDemoReserve(request);
}
