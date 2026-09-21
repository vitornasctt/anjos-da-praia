import { z } from "zod";

// Nome de pessoa: so letras (com acentos), espaco, hifen, apostrofo e ponto
// ("Maria-Clara", "D'Avila", "Jose Jr."). Sem numeros nem outros simbolos, e com
// ao menos 2 letras (barra "x", "a" e afins).
export const NAME_PATTERN = /^\p{L}[\p{L}\p{M}'\u2019.\- ]*$/u;

export function personName(label: string, max: number) {
  return z
    .string()
    .trim()
    .max(max, `${label}: no maximo ${max} caracteres.`)
    .regex(NAME_PATTERN, `${label}: use apenas letras, sem números ou símbolos.`)
    .refine((value) => (value.match(/\p{L}/gu) ?? []).length >= 2, `${label}: informe o nome completo.`)
    .transform((value) => value.replace(/\s+/g, " "));
}

// Telefone: so digitos e a formatacao usual "( ) - +" e espacos, com 10 a 15
// digitos (DDD + numero; aceita codigo do pais, ex.: +55 27 99999-0000).
const PHONE_CHARS = /^[\d\s()+\-]+$/;

export function isValidPhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return PHONE_CHARS.test(value) && digits.length >= 10 && digits.length <= 15;
}

export const phoneSchema = z
  .string()
  .trim()
  .max(20, "Telefone: no máximo 20 caracteres.")
  .refine(isValidPhone, "Telefone inválido: use só números com DDD. Ex.: (27) 99999-0000.");
