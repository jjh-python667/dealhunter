export function allowsAccountWrite(request: Request): boolean {
  const origin = new URL(request.url).origin;
  const contentType = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  return request.headers.get("origin") === origin &&
    request.headers.get("x-dh-csrf") === "1" && contentType === "application/json";
}
