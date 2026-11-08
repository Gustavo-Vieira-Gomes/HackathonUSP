# Retomada HACK-15

Checkout /tmp/HackathonUSP-hack15, branch feat/hack-15-demo-seed, HEAD cec54eac3ab52d1dcac766c741e106f7fbb743cc. Pull --ff-only origin main GitHub exit0 comprovado. Main alheia não modificada.

Plano aprovado por Maestro sob delegação explícita do usuário: aprovação literal na mensagem "Como Maestro, aprovo o plano HACK-15 e escolhas rotineiras propostas para MVP". plan.md registra delegação, não fala literal do usuário final. Cidade São Paulo, SCOPP Pompéia/CURA Jardins alvos futuros, UI estilo existente e preços demonstrativos aprovados. Substituir unidades não verificáveis autorizado sem novo gate. Não inventar CNES/responsável/TUSS/credenciais/clinicalReview.

Fase BUILD. Código/testes em desenvolvimento pelos agentes; provas funcionais novas ainda não concluídas. npm ci exit0; scripts Prisma/esbuild bloqueados pelo allowScripts ambiente, pode executar binários necessários explicitamente conforme autorização de implementação. Node global26, projeto pede24.

Postgres16.2 exclusivo em /tmp/hack15-postgres, porta55415, socket mesmo diretório, banco hack15_demo (vazio). Binários reutilizados de /tmp/hack23-pg312/lib/python3.12/site-packages/pgserver/pginstall/bin. NÃO tocar /tmp/hack23-postgres ou processo289338. Usuário local manza, authtrust somente local. DATABASE_URL local postgresql://manza@127.0.0.1:55415/hack15_demo . Sem .env criado ainda.

Skill tlc-spec-lean lida; leia referências checks/build e faça validate_checks --execute ANTES implementação. Skill requer proofs em HEAD limpo, independentVerifier LOW e validate_verification antes PR. Push/PR autorizados usuário. Nenhum commit/push ainda.

Subagente /root/research_clinics SolLOW pesquisando exclusivamente research-verified.md e clinics-researched.json no diretório spec, 10clínicas/CNES/endereço/coords/responsável. Não conflitar arquivos. Já8candidatos CNES; ProExame e Hcor podem ser substituídos. Tem fontes oficiais SCOPP Luiz Carlos Donoso Scoppetta CRM37686, ZDI Dra Iman Hassan Zoghbi mas pesquisar validade por unidade. Todasdez coordenadas em research.md (corrigir pipes escapados tabela). Precisará pesquisa TUSS atual própria: ANS página codigos-da-tuss direciona API pública https://consulta-ocl.apps.sa-1a.mendixcloud.com/rest/oclservice/ANS/concepts/tuss-22?page=1&q=... e documentação /rest-doc/rest/oclservice#/ . TUSS RM articular41101316 mas confirmar oficial e distinguir joelho no nome/protocolo.

Plano portas: Exam.questionnaire Json? snapshotcanônico integral validado (key/version existentes correspondem) e Clinic.demoCalendarTarget boolean defaultfalse. Campos nullable/default preservam testes/linhas antigas. Seed 10clínicas,12pacientes,12inscrições RMjoelho; sem contas login/sessões/envios. Consentimento fictício explicitamente demonstração. Risco: alertChannels=[] em pacientes para evitar notificação? matching service ignora canal. Definir checks claros antes construir.

Busca inexiste main. Criar Nest módulo clínica +GET/api/clinics qmax120, contratos Zod públicos mínimos, Next /buscar servercomponent formulárioGET acessível; sem redesign. Critérios UI10lista, filtro nome, vazio/erro,390/1280px. Diretivas design skills lidas; visual existente aprovado. Catálogo apps/api/src/modules/exams/exam-questionnaires.seed.ts 9modelos: us-abdomen superior8h,us-pelvis-transabdominal1h,us-thyroid,us-breast,us-musculoskeletal,echo-transthoracic,mammography,ct-without-contrast(crânio/tórax),mri-without-contrast(joelho). clinicalReview pending. Usarpreparo e contraindicationsIDsdo catálogo, snapshot completo semduplicar. Preços RM72000/50000. Demais plausíveis demonstrativos.

Atualizar SOMENTE seção HACK-15 — evidências na nota Status dos meus cards usando "$MAESTRI_CLI" note edit. CLI maestri PATH aponta AppImage errada; usar SEMPRE "$MAESTRI_CLI". maestri list revelou You Ipê conectado Maestro. Reportar via ask Maestro com askback Ipê. Se necessário debug usar mesmo binário. A nota já contém seção, não duplicar. Não editar tabela/resumo do Maestro.

Skills coding-guidelines,graphify(target lookup semgraph),maestri,local-businesses,frontend-design,bencium carregadas. Globalrules/.AGENTS lidas de main e checkout. Sem AGENTS adicional encontrado.

## Atualização CHECKS/BUILD

validate_checks --execute PASSOU 0 erros/0 avisos /tmp/hack15-checks-gate.log. Build baseline passou. Dez TUSS oficiais confirmados em tuss-verified.md. Agentes LOW despachados: /root/implement_seed backend/seed/contracts/rootpackage; /root/implement_search_ui somenteapps/web; /root/research_clinics somentepesquisa. Semcommitsautorizadosaagentes. Autorcoordenarácommits,provas,Verifier ePR.

## Progresso atual

Researchagentepropôs10: SCOPP2,CURA2,ZDI1,CDB5 (AnaRosa9060774,Brasil3503094146,BorbaGato7841272,Marselhesa3094162,Mooca9182772), aguardandocoords efontesmanifesto. Substituições aceitas autorizadas. CURA RT Luci Mara Barbiero CRM120433/SP emrodapéunidadeoficial. SCOPP LuizCarlosDonosoScoppetta37686. ZDI ImanHassanZoghbi74483. Não inferirscopeindividualdefooter marca. npmrunbuildbaselinepassou. Novo código já sendo editado agentes,nãoconflitar. GHloginlipe-manza existente,nenhumaPRdabranch. CI usaPostgres17 local16.2; informei backendagent. Verifierreference lida agora; seráfrescoLOWapósprovasHEADlimpo.
