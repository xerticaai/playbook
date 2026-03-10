XERTICA OPERATIONS: UI/UX DESIGN SYSTEM & BRANDBOOK

Versão: 2.0 (Dynamic Theming - Baseado no Brand Kit V.2)
Foco: Hub de Operações, Dashboards e Portais Seguros (Dark & Light Mode)

1. Filosofia de Design (Core Principles)

A interface dos sistemas internos da Xertica é cinematográfica, imersiva e de vanguarda, mas agora com dualidade de ambiente para conforto visual durante o uso prolongado (ex: CRMs).

Retro-Futurismo Elegante: Fundo com grelhas de dados sutis. No Modo Escuro, evoca a nostalgia do terminal tecnológico; no Modo Claro, evoca o "Clean Corporate" moderno.

Profundidade Espacial (Glassmorphism Suave): Elementos flutuam sobre o fundo usando desfoque de vidro (blur). No Modo Escuro, usamos fundos translúcidos iluminados; no Modo Claro, usamos vidros esbranquiçados com sombras difusas.

Luz Dinâmica (Flashlight UX): A interface reage ao utilizador. A luz segue o cursor do rato, mas a intensidade varia: forte e contrastante no Modo Escuro, e extremamente subtil e orgânica no Modo Claro.

Codificação por Cores (Color Coding) Adaptativa: Cada área de negócio tem a sua cor primária. Para garantir legibilidade máxima, usamos a Variação 50 (Brilhante) no Modo Escuro e a Variação 100 (Profunda) no Modo Claro.

2. Paleta de Cores & Temas (Design Tokens)

O nosso sistema usa a inversão semântica. O white (branco) do Tailwind não significa necessariamente a cor branca, mas sim a "cor de texto forte do tema".

A. Modo Escuro (Default - :root)

O ambiente imersivo de alta concentração e contraste.

Background Deep: #03070d (Azul abissal)

Surface Glass: rgba(13, 19, 31, 0.45) (Fundo de cards)

Glass Highlight: rgba(255, 255, 255, 0.08) (Bordas de vidro)

Texto Forte: #FFFFFF

Texto Base: #E2E8F0

B. Modo Claro ([data-theme="light"])

O ambiente suave e iluminado para trabalho diurno prolongado.

Background Deep: #f8fafc (Slate 50)

Surface Glass: rgba(255, 255, 255, 0.75) (Vidro branco translúcido)

Glass Highlight: rgba(0, 0, 0, 0.06) (Bordas escurecidas)

Texto Forte: #0F172A (Slate 900)

Texto Base: #334155 (Slate 700)

3. Cores de Marca (Adaptáveis)

Para manter a identidade visual sem ferir a acessibilidade visual (WCAG), as cores da Xertica "mudam de tom" quando o tema muda, baseando-se no Brand Kit V.2:

🔴 CYAN BRAND (Visão Executiva / Core)

Modo Escuro (Tone 50): #00BEFF (Glow vibrante)

Modo Claro (Tone 100): #047EA9 (Azul corporativo profundo para legibilidade)

🟢 GREEN BRAND (Visão Sales)

Modo Escuro (Tone 50): #C0FF7D (Verde neon)

Modo Claro (Tone 100): #7FA856 (Verde musgo sofisticado)

🟣 PINK BRAND (Automation Hub / Data)

Modo Escuro (Tone 50): #FF89FF (Rosa neon)

Modo Claro (Tone 100): #A85CA9 (Magenta escurecido)

4. Troca Inteligente de Logótipos

Em vez de usar Javascript complexo para trocar de imagens quando o utilizador clica no botão "Claro/Escuro", o sistema usa CSS nativo (content: url()).
Os logos brancos são carregados no HTML padrão. Quando data-theme="light" é ativado no <html>, o CSS sobrepõe as imagens pelas versões pretas correspondentes.

[data-theme="light"] .logo-green { content: url('.../X_symbol_variation5_Green_Black.png'); }
[data-theme="light"] .logo-xertica { content: url('.../Logo_XERTICA_Black.png'); }


5. Materiais e Texturas Ambientais

A tríade de texturas adapta a sua opacidade:

Grelha (Grid): No Escuro, linhas brancas a 1.5%. No Claro, usa a variável --glass-border (cinza escuro transparente).

Orbes Atmosféricos: No Escuro, opacidade a 8-12%. No Claro, reduzem para apenas 4% (opacity: 0.04), virando apenas "manchas" pastéis quase impercetíveis.

Ruído Cinematográfico (Noise): No Escuro 3.5% de opacidade. No Claro, cai para 1% para não sujar o fundo branco.

6. Microinterações UI/UX

3D Parallax Tilt (Suavizado): As inclinações agora são restritas a um máximo de 1.5 graus (em vez de 8-10 graus). Isso garante o efeito 3D sem causar tontura no uso diário.

Flashlight Effect (Suavizado): A luz que segue o rato usa a variável --flashlight-color. No Modo Escuro é um branco transparente suave; no Modo Claro é uma sombra escura extremamente dissipada (rgba(0,0,0,0.015)).

7. Variáveis Globais (Código Fonte)

Cole o seguinte snippet no arquivo CSS principal do projeto para ativar o sistema de temas em qualquer nova página:

:root {
    /* ── DARK MODE (DEFAULT) ── */
    --bg-deep: #03070d;
    --bg-surface: rgba(13, 19, 31, 0.45);
    --bg-surface-hover: rgba(20, 29, 46, 0.75);
    
    --glass-border: rgba(255, 255, 255, 0.05);
    --glass-highlight: rgba(255, 255, 255, 0.08);
    
    /* Configuração do Tailwind Dynamics */
    --text-strong-rgb: 255, 255, 255;  /* Tailwind 'white' */
    --glass-dark-rgb: 0, 0, 0;         /* Tailwind 'black' */
    
    --text-main: #E2E8F0;              /* Tailwind 'gray-300' */
    --text-muted: #94A3B8;             /* Tailwind 'gray-400' */
    --text-gray: #475569;              /* Tailwind 'gray-500' */

    /* Brand Colors */
    --x-cyan-50: #00BEFF;
    --x-cyan-glow: rgba(0, 190, 255, 0.3);
    --x-cyan-bg: rgba(0, 190, 255, 0.08);
    
    --x-green-50: #C0FF7D;
    --x-green-glow: rgba(192, 255, 125, 0.25);
    --x-green-bg: rgba(192, 255, 125, 0.08);
    
    --x-pink-50: #FF89FF;
    --x-pink-glow: rgba(255, 137, 255, 0.3);
    --x-pink-bg: rgba(255, 137, 255, 0.08);

    /* Efeitos */
    --flashlight-color: rgba(255, 255, 255, 0.025);
    --flashlight-border: rgba(255, 255, 255, 0.2);
    --noise-opacity: 0.025;
    --card-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
    --card-shadow-hover: 0 12px 32px rgba(0, 0, 0, 0.3);
}

[data-theme="light"] {
    /* ── LIGHT MODE (SUAVE) ── */
    --bg-deep: #f8fafc;
    --bg-surface: rgba(255, 255, 255, 0.75);
    --bg-surface-hover: rgba(255, 255, 255, 0.95);
    
    --glass-border: rgba(0, 0, 0, 0.06);
    --glass-highlight: rgba(255, 255, 255, 1);
    
    /* Configuração do Tailwind Dynamics - Inversão de Cores */
    --text-strong-rgb: 15, 23, 42;     /* Tailwind 'white' vira escuro */
    --glass-dark-rgb: 255, 255, 255;   /* Tailwind 'black' vira branco */
    
    --text-main: #334155;              
    --text-muted: #64748b;             
    --text-gray: #94a3b8;              

    /* Brand Colors Adaptadas (Tom 100 do Brand Kit) */
    --x-cyan-50: #047EA9; 
    --x-cyan-glow: rgba(4, 126, 169, 0.15);
    --x-cyan-bg: rgba(4, 126, 169, 0.05);
    
    --x-green-50: #7FA856; 
    --x-green-glow: rgba(127, 168, 86, 0.15);
    --x-green-bg: rgba(127, 168, 86, 0.05);
    
    --x-pink-50: #A85CA9;
    --x-pink-glow: rgba(168, 92, 169, 0.15);
    --x-pink-bg: rgba(168, 92, 169, 0.05);

    /* Efeitos Reduzidos */
    --flashlight-color: rgba(0, 0, 0, 0.015);
    --flashlight-border: rgba(0, 0, 0, 0.08);
    --noise-opacity: 0.01;
    --card-shadow: 0 4px 16px rgba(0, 0, 0, 0.03);
    --card-shadow-hover: 0 8px 24px rgba(0, 0, 0, 0.06);
}
