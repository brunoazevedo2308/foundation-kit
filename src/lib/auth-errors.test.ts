import {
  AuthApiError,
  AuthSessionMissingError,
  AuthWeakPasswordError,
} from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { passwordUpdateErrorMessage } from "./auth-errors";

describe("passwordUpdateErrorMessage", () => {
  it("orienta a trocar uma senha encontrada em vazamentos", () => {
    const error = new AuthWeakPasswordError("weak", 422, ["pwned"]);
    expect(passwordUpdateErrorMessage(error)).toContain("vazamentos conhecidos");
  });

  it("explica os requisitos de caracteres sem exibir o erro bruto", () => {
    const error = new AuthWeakPasswordError("raw backend message", 422, ["characters"]);
    expect(passwordUpdateErrorMessage(error)).toBe(
      "Use uma senha com letras maiúsculas e minúsculas, número e símbolo.",
    );
  });

  it("identifica sessão de recuperação ausente", () => {
    expect(passwordUpdateErrorMessage(new AuthSessionMissingError())).toContain(
      "link de recuperação expirou",
    );
  });

  it("impede reutilização da senha atual com mensagem específica", () => {
    const error = new AuthApiError("same password", 422, "same_password");
    expect(passwordUpdateErrorMessage(error)).toBe(
      "A nova senha deve ser diferente da senha atual.",
    );
  });

  it("mantém fallback genérico para falhas desconhecidas", () => {
    expect(passwordUpdateErrorMessage(new Error("network details"))).toBe(
      "Não foi possível atualizar a senha. Tente novamente.",
    );
  });
});
