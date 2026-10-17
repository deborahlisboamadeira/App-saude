# Saúde — peso, IMC e calorias

App web (PWA) para deixar na tela inicial do celular. Funciona offline e guarda os dados só no aparelho.

- **Início**: peso, altura, IMC, calorias que comeu, queimou e ainda pode comer hoje; o mesmo para proteínas.
- **Peso**: lançamento diário com gráfico de evolução.
- **Comida**: tire foto e/ou descreva a refeição; o Claude estima calorias e proteínas (você confere e ajusta antes de salvar). Também dá para lançar os valores à mão.
- **Atividade**: escolha o exercício e o tempo para estimar as calorias, ou informe o valor medido no relógio.
- **Ajustes**: perfil, chave da API e backup (exportar/importar).

## Como as contas são feitas

- **IMC** = peso ÷ altura².
- **Meta de calorias** = metabolismo basal (fórmula de Mifflin-St Jeor) × nível de movimento da rotina, + ajuste do objetivo.
- **Ainda posso comer** = meta + calorias dos exercícios do dia − calorias comidas.
- **Exercício estimado** = (MET − 1) × peso × horas. Desconta 1 MET porque o gasto em repouso já está na meta.
- **Meta de proteína** = g/kg (padrão 1,6) × peso.

São estimativas; para metas personalizadas, converse com um(a) nutricionista.

## Instalar no celular

1. Publique com GitHub Pages: no repositório, **Settings → Pages → Deploy from a branch → `main` / `(root)`**.
2. Abra o endereço (`https://<usuario>.github.io/App-saude/`) no celular.
   - **iPhone (Safari)**: Compartilhar → *Adicionar à Tela de Início*.
   - **Android (Chrome)**: menu ⋮ → *Instalar app* / *Adicionar à tela inicial*.
3. Em **Ajustes**, preencha o perfil e cole uma chave da API do Claude (crie em platform.claude.com) para usar o cálculo por foto.

A chave fica salva apenas no navegador do celular e é enviada direto para a API da Anthropic. Cada análise de refeição é cobrada na sua conta da API.

## Atualizar

Ao alterar arquivos, aumente `VERSAO` em `sw.js` para que o celular baixe a versão nova.
