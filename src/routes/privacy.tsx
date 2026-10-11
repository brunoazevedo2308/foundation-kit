import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Aviso de Privacidade · DP Suite" },
      { name: "description", content: "Como a Callyvon trata dados pessoais no DP Suite." },
    ],
  }),
  component: PrivacyNoticePage,
});

function PrivacyNoticePage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-4 py-12 text-foreground sm:px-6">
      <Link
        to="/login"
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ← Voltar ao login
      </Link>
      <article className="mt-8 space-y-8">
        <header>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Callyvon · DP Suite
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Aviso de Privacidade</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Última atualização: 9 de outubro de 2026.
          </p>
        </header>

        <Section title="Quem somos">
          <p>
            A Callyvon disponibiliza o DP Suite, plataforma de governança para operações de Dynamic
            Positioning. Dúvidas e solicitações sobre dados pessoais podem ser enviadas para{" "}
            <a className="underline" href="mailto:admin@callyvon.com">
              admin@callyvon.com
            </a>
            .
          </p>
        </Section>

        <Section title="Dados tratados e finalidades">
          <ul className="list-disc space-y-2 pl-5">
            <li>dados de conta, perfil e organização para autenticação e controle de acesso;</li>
            <li>
              registros operacionais, comentários e arquivos para prestar as funções do produto;
            </li>
            <li>
              eventos de auditoria e segurança para prevenção de abuso, suporte e rastreabilidade;
            </li>
            <li>e-mail para convites, recuperação de senha e comunicações transacionais.</li>
          </ul>
          <p className="mt-3">
            A organização contratante determina o conteúdo operacional inserido por seus usuários.
            Evite incluir dados pessoais desnecessários ou dados sensíveis em campos livres e
            anexos.
          </p>
        </Section>

        <Section title="Bases legais e compartilhamento">
          <p>
            Conforme o contexto, o tratamento pode ser necessário para executar contrato, cumprir
            obrigações legais ou regulatórias, exercer direitos e proteger interesses legítimos e a
            segurança do serviço. Quando o consentimento for a base adequada, ele poderá ser
            revogado. Usamos fornecedores de infraestrutura, banco de dados, hospedagem, código e
            e-mail estritamente para operar e proteger o DP Suite, sujeitos às salvaguardas
            contratuais e técnicas aplicáveis.
          </p>
        </Section>

        <Section title="Retenção e segurança">
          <p>
            Os dados são mantidos pelo período necessário às finalidades informadas, ao contrato e
            às obrigações de retenção e defesa de direitos. Depois, são eliminados ou anonimizados
            quando aplicável. Aplicamos controle de acesso por organização, armazenamento privado,
            trilhas de auditoria, backups criptografados e monitoramento operacional.
          </p>
        </Section>

        <Section title="Seus direitos">
          <p>
            Você pode solicitar confirmação e acesso, correção, informação, portabilidade quando
            aplicável, oposição, revisão, revogação de consentimento e eliminação nos casos
            previstos em lei. Usuários autenticados podem registrar e acompanhar pedidos na Central
            de Privacidade. Também é possível usar o e-mail administrativo acima. Poderemos
            solicitar informações adicionais para confirmar sua identidade antes de atender ao
            pedido.
          </p>
        </Section>

        <Section title="Cookies e armazenamento local">
          <p>
            O DP Suite usa somente recursos necessários à sessão autenticada e às preferências da
            interface. Nesta versão não utilizamos cookies de publicidade ou rastreamento
            comportamental de terceiros.
          </p>
        </Section>
      </article>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <div className="mt-3 text-sm leading-6 text-muted-foreground">{children}</div>
    </section>
  );
}
