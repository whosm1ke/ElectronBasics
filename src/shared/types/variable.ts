// Mirrors sanitizeVariable() in src/main/storage/variables.js.
export interface Variable {
  id: string;
  name: string; // trimmed, <=100 chars
  value: string; // <=2000 chars
  secret: boolean;
}
