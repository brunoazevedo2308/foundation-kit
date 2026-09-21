import {
  isAuthSessionMissingError,
  isAuthWeakPasswordError,
  type AuthError,
} from "@supabase/supabase-js";

const GENERIC_PASSWORD_UPDATE_ERROR = "Não foi possível atualizar a senha. Tente novamente.";

function authErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) return undefined;
  const code = (error as Pick<AuthError, "code">).code;
  return typeof code === "string" ? code : undefined;
}

/**
 * Converte erros do Supabase Auth em mensagens acionáveis sem exibir o texto
 * bruto do backend. Os motivos de senha fraca são categorias públicas e não
 * carregam tokens, e-mails ou outros dados sensíveis.
 */
export function passwordUpdateErrorMessage(error: unknown): string {
  if (isAuthWeakPasswordError(error)) {
    if (error.reasons.includes("pwned")) {
      return "Esta senha aparece em vazamentos conhecidos. Escolha uma senha diferente e exclusiva.";
    }
    if (error.reasons.includes("characters")) {
      return "Use uma senha com letras maiúsculas e minúsculas, número e símbolo.";
    }
    if (error.reasons.includes("length")) {
      return "A senha não atende ao tamanho mínimo exigido.";
    }
    return "Escolha uma senha mais forte e tente novamente.";
  }

  const code = authErrorCode(error);
  if (
    isAuthSessionMissingError(error) ||
    code === "otp_expired" ||
    code === "session_expired" ||
    code === "session_not_found"
  ) {
    return "O link de recuperação expirou ou já foi utilizado. Solicite um novo.";
  }
  if (code === "same_password") {
    return "A nova senha deve ser diferente da senha atual.";
  }

  return GENERIC_PASSWORD_UPDATE_ERROR;
}
