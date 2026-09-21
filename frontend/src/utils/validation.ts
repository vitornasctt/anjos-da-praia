// Mesmas regras do servidor (backend/src/utils/validation.ts): a tela ja
// impede o erro, e o servidor continua recusando se alguem burlar a tela.

// Nome de pessoa: letras (com acentos), espaco, hifen, apostrofo e ponto.
const NAME_CHARS_REMOVED = /[^\p{L}\p{M}'\u2019.\- ]/gu;
const NAME_PATTERN = /^\p{L}[\p{L}\p{M}'\u2019.\- ]*$/u;

// Remove o que nao pode entrar num nome (numeros, simbolos), digitado ou colado.
export function cleanName(value: string): string {
  return value.replace(NAME_CHARS_REMOVED, "");
}

export function isValidName(value: string): boolean {
  const name = value.trim();
  return NAME_PATTERN.test(name) && (name.match(/\p{L}/gu) ?? []).length >= 2;
}

// Telefone: so numeros e a formatacao usual "( ) - +" e espacos.
export function cleanPhone(value: string): string {
  return value.replace(/[^\d\s()+\-]/g, "");
}

// 10 a 15 digitos: DDD + numero (aceita codigo do pais).
export function isValidPhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return /^[\d\s()+\-]+$/.test(value) && digits.length >= 10 && digits.length <= 15;
}
