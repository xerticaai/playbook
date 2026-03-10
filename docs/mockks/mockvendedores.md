<!DOCTYPE html>
<html lang="pt-BR" data-theme="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>X-Sales | Painel do Vendedor</title>
    
    <!-- Tailwind CSS -->
    <script src="https://cdn.tailwindcss.com"></script>
    
    <!-- Configuração Customizada do Tailwind integrada com CSS Variables para Light/Dark Mode -->
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    colors: {
                        white: 'rgb(var(--text-strong-rgb) / <alpha-value>)',
                        black: 'rgb(var(--glass-dark-rgb) / <alpha-value>)',
                        gray: {
                            300: 'var(--text-main)',
                            400: 'var(--text-muted)',
                            500: 'var(--text-gray)'
                        },
                        xCyan: 'var(--x-cyan-50)',
                        xPink: 'var(--x-pink-50)',
                        xGreen: 'var(--x-green-50)',
                        xGreenDark: 'var(--x-green-dark)',
                        xDark: 'var(--bg-deep)'
                    },
                    animation: {
                        'grid-flow': 'gridFlow 25s linear infinite',
                        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                        'slide-in-right': 'slideInRight 0.5s ease-out forwards',
                    },
                    keyframes: {
                        gridFlow: {
                            '0%': { transform: 'translateY(0)' },
                            '100%': { transform: 'translateY(40px)' }
                        },
                        slideInRight: {
                            '0%': { transform: 'translateX(20px)', opacity: '0' },
                            '100%': { transform: 'translateX(0)', opacity: '1' }
                        }
                    }
                }
            }
        }
    </script>
    
    <!-- Phosphor Icons -->
    <script src="https://unpkg.com/@phosphor-icons/web"></script>
    
    <!-- Google Fonts: Poppins e Roboto -->
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&family=Roboto:wght@300;400;500;700&display=swap" rel="stylesheet">
    
    <style>
        /* ============================================================
           XERTICA.AI BRAND KIT V.2 — DYNAMIC THEME SYSTEM
           ============================================================ */
        :root {
            /* ── DARK MODE (DEFAULT) ── */
            --bg-deep: #03070d;
            --bg-surface: rgba(13, 19, 31, 0.45);
            --bg-surface-hover: rgba(20, 29, 46, 0.75);
            
            --glass-border: rgba(255, 255, 255, 0.05);
            --glass-highlight: rgba(255, 255, 255, 0.08);
            
            --text-strong-rgb: 255, 255, 255;  /* Tailwind 'white' */
            --glass-dark-rgb: 0, 0, 0;         /* Tailwind 'black' */
            
            --text-main: #E2E8F0;              /* Tailwind 'gray-300' */
            --text-muted: #94A3B8;             /* Tailwind 'gray-400' */
            --text-gray: #475569;              /* Tailwind 'gray-500' */

            /* Brand Colors (Dark Mode) */
            --x-cyan-50: #00BEFF;
            --x-cyan-glow: rgba(0, 190, 255, 0.3);
            --x-cyan-bg: rgba(0, 190, 255, 0.08);
            
            --x-green-50: #C0FF7D;
            --x-green-dark: #8EBB5F;
            --x-green-glow: rgba(192, 255, 125, 0.25);
            --x-green-bg: rgba(192, 255, 125, 0.08);
            
            --x-pink-50: #FF89FF;
            --x-pink-dark: #D156D2;
            --x-pink-glow: rgba(255, 137, 255, 0.3);
            --x-pink-bg: rgba(255, 137, 255, 0.08);

            --flashlight-color: rgba(255, 255, 255, 0.025);
            --flashlight-border: rgba(255, 255, 255, 0.2);
            --noise-opacity: 0.025;
            
            /* Shadows mais suaves */
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
            
            --text-strong-rgb: 15, 23, 42;     /* Tailwind 'white' agora é Slate-900 */
            --glass-dark-rgb: 255, 255, 255;   /* Tailwind 'black' agora é Branco (Inversão) */
            
            --text-main: #334155;              /* Tailwind 'gray-300' agora é escuro */
            --text-muted: #64748b;             /* Tailwind 'gray-400' */
            --text-gray: #94a3b8;              /* Tailwind 'gray-500' */

            /* Brand Colors (Adaptação para Fundo Claro - Brand Kit V.2) */
            --x-cyan-50: #047EA9; 
            --x-cyan-glow: rgba(4, 126, 169, 0.15);
            --x-cyan-bg: rgba(4, 126, 169, 0.05);
            
            --x-green-50: #7FA856; 
            --x-green-dark: #6a8c48;
            --x-green-glow: rgba(127, 168, 86, 0.15);
            --x-green-bg: rgba(127, 168, 86, 0.05);
            
            --x-pink-50: #A85CA9;
            --x-pink-dark: #8c4d8c;
            --x-pink-glow: rgba(168, 92, 169, 0.15);
            --x-pink-bg: rgba(168, 92, 169, 0.05);

            --flashlight-color: rgba(0, 0, 0, 0.015);
            --flashlight-border: rgba(0, 0, 0, 0.08);
            --noise-opacity: 0.01;
            
            --card-shadow: 0 4px 16px rgba(0, 0, 0, 0.03);
            --card-shadow-hover: 0 8px 24px rgba(0, 0, 0, 0.06);
        }

        /* ── TROCA INTELIGENTE DE LOGÓTIPOS (CSS CONTENT) ── */
        [data-theme="light"] .logo-green { content: url('https://storage.googleapis.com/etp-bucket/Logos%20Xertica.ai%20(.png)/X%20-%20simbolo/Copy%20of%20X_symbol_variation5_Green_Black.png'); }
        [data-theme="light"] .logo-cyan { content: url('https://storage.googleapis.com/etp-bucket/Logos%20Xertica.ai%20(.png)/X%20-%20simbolo/Copy%20of%20X_symbol_variation2_Blue_Black.png'); }
        [data-theme="light"] .logo-pink { content: url('https://storage.googleapis.com/etp-bucket/Logos%20Xertica.ai%20(.png)/X%20-%20simbolo/Copy%20of%20X_symbol_variation7_Pink_Black.png'); }
        [data-theme="light"] .logo-xertica { content: url('https://storage.googleapis.com/etp-bucket/Logos%20Xertica.ai%20(.png)/xertica.ai/Copy%20of%20Logo_XERTICA_Black.png'); }

        * { box-sizing: border-box; }

        body { 
            margin: 0; 
            font-family: var(--font-body); 
            background-color: var(--bg-deep);
            color: var(--text-main); 
            height: 100vh; 
            overflow: hidden;
            position: relative;
            display: flex;
            transition: background-color 0.4s ease, color 0.4s ease;
        }

        /* ── BACKGROUNDS AMBIENTAIS SUAVIZADOS ── */
        .bg-grid-container {
            position: fixed; inset: -40px 0 0 0; z-index: -2; pointer-events: none;
            background-image: linear-gradient(var(--glass-border) 1px, transparent 1px), linear-gradient(90deg, var(--glass-border) 1px, transparent 1px);
            background-size: 40px 40px; opacity: 0.5;
            mask-image: radial-gradient(ellipse at top right, black 0%, transparent 70%);
            -webkit-mask-image: radial-gradient(ellipse at top right, black 0%, transparent 70%);
            transition: opacity 0.4s ease;
        }

        .noise-overlay {
            position: fixed; inset: 0; z-index: 999; pointer-events: none; opacity: var(--noise-opacity);
            background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
            mix-blend-mode: overlay; transition: opacity 0.4s ease;
        }

        .bg-orbs { position: fixed; inset: 0; overflow: hidden; z-index: -1; pointer-events: none; }
        .orb { position: absolute; border-radius: 50%; filter: blur(140px); opacity: 0.08; animation: drift 30s infinite alternate ease-in-out; transition: background 0.4s ease, opacity 0.4s ease; }
        [data-theme="light"] .orb { opacity: 0.04; } /* Orbes quase invisíveis no modo claro */
        
        .orb-main { width: 50vw; height: 50vw; background: var(--x-green-50); top: -10%; right: -10%; }
        .orb-sec { width: 35vw; height: 35vw; background: var(--x-cyan-50); bottom: -20%; left: -10%; animation-delay: -7s; }
        
        @keyframes drift {
            0% { transform: translate(0, 0) scale(1); }
            50% { transform: translate(1vw, 2vh) scale(1.02); }
            100% { transform: translate(-1vw, 1vh) scale(0.98); }
        }

        /* ── SIDEBAR (GLASSMORPHISM SUAVE) ── */
        .sidebar {
            width: 260px;
            background: var(--bg-surface);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border-right: 1px solid var(--glass-border);
            display: flex;
            flex-direction: column;
            z-index: 100;
            box-shadow: 4px 0 24px rgba(0,0,0,0.05);
            transition: all 0.4s ease;
        }

        .nav-item {
            padding: 10px 18px;
            margin: 4px 16px;
            border-radius: 10px;
            cursor: pointer;
            transition: all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
            font-family: var(--font-heading);
            font-weight: 500;
            font-size: 13px;
            color: var(--text-muted);
            display: flex;
            align-items: center;
            gap: 12px;
            position: relative;
        }

        .nav-item:hover {
            color: var(--text-white);
            background: var(--glass-border);
        }

        .nav-item.active {
            color: var(--x-green-50);
            background: var(--x-green-bg);
            border: 1px solid var(--x-green-glow);
            font-weight: 600;
        }

        .nav-item.active::before {
            content: ''; position: absolute; left: 0; top: 20%; bottom: 20%; width: 3px;
            background: var(--x-green-50); border-radius: 0 4px 4px 0;
        }

        .nav-item i { font-size: 18px; transition: all 0.3s; }

        .nav-group-title {
            margin: 24px 20px 8px;
            font-family: var(--font-heading);
            font-size: 10px;
            font-weight: 700;
            color: var(--text-gray);
            text-transform: uppercase;
            letter-spacing: 1.5px;
            opacity: 0.8;
        }

        /* ── MAIN CONTENT AREA ── */
        .main-wrapper { flex: 1; display: flex; flex-direction: column; overflow: hidden; position: relative; }

        /* ── TOPBAR ── */
        .topbar {
            height: 72px;
            background: var(--bg-surface);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border-bottom: 1px solid var(--glass-border);
            display: flex; align-items: center; justify-content: space-between;
            padding: 0 32px; z-index: 90; transition: all 0.4s ease;
        }

        .search-bar {
            background: var(--glass-border);
            border: 1px solid transparent;
            border-radius: 99px;
            padding: 8px 16px 8px 40px;
            color: var(--text-white);
            font-family: var(--font-body);
            font-size: 13px;
            width: 280px;
            transition: all 0.3s;
            outline: none;
        }
        .search-bar:focus {
            background: var(--x-green-bg); border-color: var(--x-green-glow);
            width: 320px;
        }

        /* ── TAB CONTENT CONTAINERS ── */
        .tab-pane {
            display: none; padding: 32px; height: calc(100vh - 72px); overflow-y: auto;
            animation: fadeIn 0.3s ease-out forwards;
        }
        .tab-pane.active { display: block; }
        
        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }

        /* Custom Scrollbar Suave */
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--glass-border); border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: var(--text-gray); }

        /* ── CARDS & BENTO UI (Suave) ── */
        .glass-card {
            background: var(--bg-surface);
            border: 1px solid var(--glass-border);
            border-radius: 16px;
            padding: 24px;
            position: relative;
            overflow: hidden;
            box-shadow: var(--card-shadow);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            --mouse-x: 50%;
            --mouse-y: 50%;
            transition: transform 0.2s ease, box-shadow 0.3s ease, background 0.4s ease, border-color 0.4s ease;
            transform-style: preserve-3d; /* Para a inclinação suave */
        }

        /* Flashlight Effect - Mais discreto */
        .glass-card::before {
            content: ''; position: absolute; inset: 0; border-radius: inherit;
            background: radial-gradient(500px circle at var(--mouse-x) var(--mouse-y), var(--flashlight-color), transparent 40%);
            opacity: 0; transition: opacity 0.4s; z-index: 1; pointer-events: none;
        }
        .glass-card::after {
            content: ''; position: absolute; inset: -1px; border-radius: inherit;
            background: radial-gradient(250px circle at var(--mouse-x) var(--mouse-y), var(--flashlight-border), transparent 40%);
            z-index: -1; opacity: 0; transition: opacity 0.4s;
            -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
            -webkit-mask-composite: xor; mask-composite: exclude; padding: 1px; 
        }

        .glass-card:hover::before, .glass-card:hover::after { opacity: 1; }
        
        .glass-card.theme-green:hover::after { background: radial-gradient(250px circle at var(--mouse-x) var(--mouse-y), var(--x-green-50), transparent 40%); }
        .glass-card.theme-green:hover { box-shadow: var(--card-shadow-hover); border-color: transparent; }

        .glass-card.theme-pink:hover::after { background: radial-gradient(250px circle at var(--mouse-x) var(--mouse-y), var(--x-pink-50), transparent 40%); }
        .glass-card.theme-pink:hover { box-shadow: var(--card-shadow-hover); border-color: transparent; }

        .card-content { position: relative; z-index: 10; pointer-events: auto; transform: translateZ(10px); transition: transform 0.2s ease; }

        .kpi-title { font-family: var(--font-heading); font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: var(--text-muted); font-weight: 600; display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
        .kpi-value { font-family: var(--font-heading); font-size: 28px; font-weight: 700; color: var(--text-white); line-height: 1.1; margin-bottom: 4px; letter-spacing: -0.5px; transition: color 0.4s; }
        .kpi-sub { font-size: 12px; color: var(--text-gray); }

        .progress-track { width: 100%; height: 6px; background: var(--glass-border); border-radius: 99px; overflow: hidden; margin-top: 12px; }
        .progress-fill { height: 100%; border-radius: 99px; position: relative; background: var(--x-green-50); }

        /* ── TABELA EXPANSÍVEL ── */
        .table-glass { width: 100%; border-collapse: separate; border-spacing: 0; font-family: var(--font-body); }
        .table-glass th { 
            font-family: var(--font-heading); font-size: 10px; text-transform: uppercase; letter-spacing: 1px; 
            color: var(--text-muted); padding: 14px 20px; font-weight: 600; text-align: left;
            border-bottom: 1px solid var(--glass-border); position: sticky; top: 0; z-index: 20; 
        }
        
        .deal-row { transition: all 0.2s ease; cursor: pointer; }
        .deal-row td { 
            padding: 14px 20px; font-size: 13px; color: var(--text-main); 
            border-bottom: 1px solid var(--glass-border); vertical-align: middle;
            background: transparent; transition: background 0.2s ease;
        }
        .deal-row:hover td { background: var(--x-green-bg); color: var(--text-white); }
        .deal-row.active td { background: var(--x-green-bg); border-bottom-color: transparent; }
        
        .deal-row td:first-child { position: relative; }
        .deal-row td:first-child::before {
            content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px;
            background: var(--x-green-50); opacity: 0; transition: opacity 0.2s ease;
        }
        .deal-row:hover td:first-child::before, .deal-row.active td:first-child::before { opacity: 1; }

        .expand-icon { transition: transform 0.3s ease; color: var(--text-muted); }
        .deal-row.active .expand-icon { transform: rotate(90deg); color: var(--x-green-50); }

        .deal-details { display: none; }
        .deal-row.active + .deal-details { display: table-row; animation: fadeIn 0.2s ease; }
        .deal-details td { padding: 0; border-bottom: 1px solid var(--glass-border); background: var(--glass-border); } /* Cor suave para expansão */
        .details-wrapper { padding: 20px 24px; border-left: 3px solid var(--x-green-50); display: flex; gap: 32px; }

        /* ── BADGES & TAGS ── */
        .badge { display: inline-flex; align-items: center; padding: 4px 10px; border-radius: 6px; font-size: 10px; font-family: var(--font-heading); font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap; gap: 4px; }
        .bg-green-soft { background: var(--x-green-bg); border: 1px solid var(--x-green-glow); color: var(--x-green-50); }
        .bg-cyan-soft { background: var(--x-cyan-bg); border: 1px solid var(--x-cyan-glow); color: var(--x-cyan-50); }
        .bg-pink-soft { background: var(--x-pink-bg); border: 1px solid var(--x-pink-glow); color: var(--x-pink-50); }
        .bg-yellow-soft { background: rgba(251, 191, 36, 0.1); border: 1px solid rgba(251, 191, 36, 0.3); color: #d97706; }
        [data-theme="dark"] .bg-yellow-soft { color: #fbbf24; }
        .bg-gray-soft { background: var(--glass-border); border: 1px solid var(--glass-border); color: var(--text-muted); }

        /* ── AI SCORE RING ── */
        .score-ring { position: relative; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-family: var(--font-heading); font-size: 11px; font-weight: 700; background: var(--bg-surface); }
        .score-ring.high { border: 2px solid var(--x-green-50); color: var(--x-green-50); }
        .score-ring.med { border: 2px solid #f59e0b; color: #f59e0b; }
        .score-ring.low { border: 2px solid #ef4444; color: #ef4444; }
        [data-theme="dark"] .score-ring.med { border-color: #fbbf24; color: #fbbf24; }
        [data-theme="dark"] .score-ring.low { border-color: #f87171; color: #f87171; }

        /* ── TIMELINE ── */
        .timeline { position: relative; padding-left: 20px; }
        .timeline::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 1px; background: var(--glass-border); }
        .tl-item { position: relative; margin-bottom: 24px; }
        .tl-dot { position: absolute; left: -25px; top: 4px; width: 10px; height: 10px; border-radius: 50%; background: var(--bg-deep); border: 2px solid var(--text-muted); z-index: 2; transition: all 0.3s; }
        .tl-item:hover .tl-dot { border-color: var(--x-green-50); transform: scale(1.2); }
        .tl-content { background: var(--bg-surface); border: 1px solid var(--glass-border); border-radius: 12px; padding: 14px; transition: all 0.3s; }
        .tl-item:hover .tl-content { border-color: var(--x-green-glow); }

        /* ── CALCULADORA INPUTS ── */
        .sim-checkbox { appearance: none; width: 18px; height: 18px; border: 1px solid var(--glass-border); border-radius: 4px; background: var(--bg-surface); cursor: pointer; position: relative; transition: all 0.2s; }
        .sim-checkbox:checked { background: var(--x-green-50); border-color: var(--x-green-50); }
        .sim-checkbox:checked::after { content: '✔'; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: #fff; font-size: 11px; font-weight: bold; }
        [data-theme="light"] .sim-checkbox:checked::after { color: #fff; } /* Icone sempre branco no check */

        /* Botões */
        .btn-primary {
            display: inline-flex; align-items: center; justify-content: center; gap: 8px;
            background: var(--x-green-bg); border: 1px solid var(--x-green-glow); color: var(--x-green-50);
            padding: 8px 16px; border-radius: 8px; font-family: var(--font-heading); font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; cursor: pointer; transition: all 0.2s ease;
        }
        .btn-primary:hover { background: var(--x-green-50); color: #fff; transform: translateY(-1px); box-shadow: 0 4px 12px var(--x-green-glow); }
        [data-theme="light"] .btn-primary:hover { color: #fff; } /* Garantir legibilidade no botão preenchido */

        .btn-icon { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 8px; background: var(--glass-border); color: var(--text-muted); border: 1px solid transparent; transition: all 0.2s; cursor: pointer; }
        .btn-icon:hover { background: var(--x-green-bg); color: var(--x-green-50); border-color: var(--x-green-glow); }

        .text-gradient-green { background: linear-gradient(90deg, var(--x-green-50), var(--x-green-dark)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .text-gradient-pink { background: linear-gradient(90deg, var(--x-pink-50), var(--x-pink-dark)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    </style>
</head>
<body>

    <!-- TEXTURAS E FUNDO -->
    <div class="noise-overlay"></div>
    <div class="bg-grid-container"></div> <!-- Animação removida para ser mais suave -->
    <div class="bg-orbs">
        <div class="orb orb-main"></div>
        <div class="orb orb-sec"></div>
    </div>

    <!-- ── SIDEBAR ── -->
    <aside class="sidebar py-6">
        <!-- Logo -->
        <div class="px-6 mb-8 flex items-center gap-3 cursor-pointer" onclick="window.location.href='index.html'">
            <!-- Classe logo-green vai trocar a imagem via CSS no Light Mode -->
            <img src="https://storage.googleapis.com/etp-bucket/Logos%20Xertica.ai%20(.png)/X%20-%20simbolo/X_symbol_variation8_Green_white.png" alt="Xertica X" class="h-7 w-7 object-contain logo-green">
            <div>
                <img src="https://storage.googleapis.com/etp-bucket/Logos%20Xertica.ai%20(.png)/xertica.ai/Copy%20of%20Logo_XERTICA_white.png" alt="Xertica.ai" class="h-3.5 object-contain mb-1 logo-xertica">
                <div class="font-poppins text-[9px] font-bold text-xGreen tracking-[0.2em] uppercase">Sales Workspace</div>
            </div>
        </div>

        <!-- User Info Reduzida -->
        <div class="px-5 mb-6">
            <div class="p-2.5 rounded-xl bg-black/20 border border-white/5 flex items-center gap-3 transition-colors">
                <div class="h-8 w-8 rounded-lg bg-xGreen/10 border border-xGreen/30 flex items-center justify-center text-xGreen font-poppins font-bold text-xs">
                    CF
                </div>
                <div class="overflow-hidden">
                    <p class="font-poppins text-xs font-semibold text-white truncate">Carlos Ferreira</p>
                    <p class="text-[9px] text-gray-400 uppercase tracking-wider truncate mt-0.5">Enterprise AE</p>
                </div>
            </div>
        </div>

        <!-- Nav Links -->
        <nav class="flex-1 overflow-y-auto mt-2">
            <div class="nav-group-title">Módulos Principais</div>
            
            <div class="nav-item active" onclick="switchTab('dashboard', this)">
                <i class="ph ph-squares-four"></i> Visão Geral
            </div>
            <div class="nav-item" onclick="switchTab('pipeline', this)">
                <i class="ph ph-funnel"></i> Meu Pipeline
                <span class="ml-auto bg-xGreen/20 text-xGreen text-[10px] px-2 py-0.5 rounded-full font-bold">14</span>
            </div>
            <div class="nav-item" onclick="switchTab('activities', this)">
                <i class="ph ph-calendar-check"></i> Atividades CRM
                <span class="ml-auto w-1.5 h-1.5 rounded-full bg-red-500"></span>
            </div>
            
            <div class="nav-group-title mt-6">Financeiro</div>
            
            <div class="nav-item" onclick="switchTab('calculator', this)">
                <i class="ph ph-calculator"></i> Calc. Comissão
            </div>
            <div class="nav-item" onclick="switchTab('faturamento', this)">
                <i class="ph ph-receipt"></i> Faturamento Hist.
            </div>

            <div class="nav-group-title mt-6">Inteligência</div>
            
            <div class="nav-item" onclick="switchTab('ai-insights', this)">
                <i class="ph ph-sparkle text-xPink"></i> War Room AI
            </div>
        </nav>

        <!-- Sair -->
        <div class="px-4 mt-auto pt-4 border-t border-white/5">
            <div class="nav-item hover:!text-red-500 hover:!bg-red-500/10">
                <i class="ph ph-sign-out"></i> Sair do Sistema
            </div>
        </div>
    </aside>

    <!-- ── MAIN WRAPPER ── -->
    <div class="main-wrapper">
        
        <!-- TOPBAR -->
        <header class="topbar">
            <div class="flex items-center gap-4">
                <h2 id="page-title" class="font-poppins text-base font-semibold text-white tracking-wide">Visão Geral</h2>
                <div class="h-3 w-px bg-white/20"></div>
                <p class="text-xs text-gray-400">Q3 2026</p>
            </div>
            
            <div class="flex items-center gap-5">
                <!-- Search -->
                <div class="relative hidden md:block">
                    <i class="ph ph-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-base"></i>
                    <input type="text" class="search-bar" placeholder="Procurar oportunidade ou conta...">
                    <div class="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                        <kbd class="font-sans text-[9px] bg-black/20 px-1 rounded text-gray-400 border border-white/5">⌘K</kbd>
                    </div>
                </div>
                
                <!-- Notificações -->
                <button class="relative text-gray-400 hover:text-white transition-colors">
                    <i class="ph ph-bell text-xl"></i>
                    <span class="absolute top-0 right-0 w-2 h-2 bg-xPink rounded-full border-2 border-transparent"></span>
                </button>

                <div class="h-4 w-px bg-white/10 mx-1"></div>

                <!-- Botão Toggle Tema Claro/Escuro -->
                <button onclick="toggleTheme()" class="text-gray-400 hover:text-xCyan transition-colors" id="theme-toggle" title="Alternar Tema">
                    <i class="ph ph-sun text-xl hidden dark-icon"></i>
                    <i class="ph ph-moon text-xl light-icon"></i>
                </button>
            </div>
        </header>

        <!-- CONTEÚDO SCROLLÁVEL -->
        <main class="flex-1 overflow-y-auto relative">
            
            <!-- ========================================== -->
            <!-- ABA 1: DASHBOARD (VISÃO GERAL)             -->
            <!-- ========================================== -->
            <div id="tab-dashboard" class="tab-pane active">
                <div class="max-w-7xl mx-auto">
                    
                    <!-- Header Secção -->
                    <div class="mb-6">
                        <h1 class="font-poppins text-2xl font-bold text-white mb-1">Olá, Carlos. Bom retorno.</h1>
                        <p class="text-gray-400 text-sm">Você está a <span class="text-xGreen font-semibold">82%</span> do atingimento da sua meta de Gross Margin.</p>
                        
                        <!-- Progress Quota Suave -->
                        <div class="mt-5 p-4 rounded-xl bg-white/5 border border-white/5">
                            <div class="flex justify-between items-end mb-2">
                                <div>
                                    <p class="text-[10px] text-gray-400 font-poppins uppercase tracking-wider mb-1">Progresso Q3</p>
                                    <p class="font-poppins text-lg text-white font-bold">$ 410k <span class="text-xs text-gray-500 font-normal">/ $ 500k Meta</span></p>
                                </div>
                                <div class="text-right">
                                    <p class="text-xGreen font-poppins font-bold text-base">82%</p>
                                </div>
                            </div>
                            <div class="progress-track">
                                <div class="progress-fill" style="width: 82%;"></div>
                            </div>
                        </div>
                    </div>

                    <!-- KPI Bento Grid Suave -->
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                        
                        <!-- KPI 1 -->
                        <div class="glass-card theme-green !p-5">
                            <div class="card-content">
                                <div class="kpi-title"><i class="ph ph-check-circle text-base text-xGreen"></i> Gross Fechado</div>
                                <div class="kpi-value">$ 124.5k</div>
                                <div class="kpi-sub flex items-center gap-1 text-xGreen mt-1"><i class="ph ph-trend-up"></i> +12% vs Q2</div>
                            </div>
                        </div>

                        <!-- KPI 2 -->
                        <div class="glass-card theme-green !p-5">
                            <div class="card-content">
                                <div class="kpi-title"><i class="ph ph-funnel text-base text-xCyan"></i> Pipeline Ponderado</div>
                                <div class="kpi-value">$ 380.0k</div>
                                <div class="kpi-sub text-gray-400 mt-1">14 Oportunidades Abertas</div>
                            </div>
                        </div>

                        <!-- KPI 3 -->
                        <div class="glass-card theme-green !p-5">
                            <div class="card-content">
                                <div class="kpi-title"><i class="ph ph-receipt text-base text-gray-400"></i> Faturamento Conf.</div>
                                <div class="kpi-value">$ 85.2k</div>
                                <div class="kpi-sub flex items-center gap-1 text-red-500 mt-1"><i class="ph ph-warning"></i> 2 faturas atrasadas</div>
                            </div>
                        </div>

                        <!-- KPI 4 (Comissão) -->
                        <div class="glass-card theme-green !p-5 border-xGreen/20 bg-xGreen/5">
                            <div class="card-content">
                                <div class="kpi-title !text-xGreen"><i class="ph ph-money text-base"></i> Comissão Projetada</div>
                                <div class="kpi-value text-gradient-green">$ 12,450</div>
                                <div class="kpi-sub text-gray-400 mt-1">Simulação atual</div>
                            </div>
                        </div>
                    </div>

                    <!-- Layout Misto -->
                    <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
                        
                        <!-- Coluna Larga: Next Steps Prioritários -->
                        <div class="lg:col-span-2 glass-card theme-green !p-0 flex flex-col h-[350px]">
                            <div class="p-4 border-b border-white/5 flex justify-between items-center card-content bg-black/10">
                                <h3 class="font-poppins font-semibold text-white text-sm">Fechamentos Iminentes (Próx 15 dias)</h3>
                                <button onclick="switchTab('pipeline', document.querySelectorAll('.nav-item')[1])" class="text-xs text-xGreen hover:underline font-poppins">Ver Pipeline</button>
                            </div>
                            <div class="flex-1 overflow-y-auto p-1 card-content">
                                <table class="table-glass !border-0">
                                    <tbody>
                                        <tr class="deal-row">
                                            <td>
                                                <p class="font-medium text-white text-sm">Migração Cloud AWS - Banco Alfa</p>
                                                <p class="text-[10px] text-gray-400 mt-0.5">Renovação • Fecha em 3 dias</p>
                                            </td>
                                            <td><span class="badge bg-cyan-soft">Negociação</span></td>
                                            <td class="font-poppins font-medium text-right text-white text-sm">$ 45.000</td>
                                        </tr>
                                        <tr class="deal-row">
                                            <td>
                                                <p class="font-medium text-white text-sm">GWS Enterprise - Varejo XYZ</p>
                                                <p class="text-[10px] text-gray-400 mt-0.5">Net New • Fecha em 8 dias</p>
                                            </td>
                                            <td><span class="badge bg-green-soft">Commit</span></td>
                                            <td class="font-poppins font-medium text-right text-white text-sm">$ 120.000</td>
                                        </tr>
                                        <tr class="deal-row">
                                            <td>
                                                <p class="font-medium text-white text-sm">Data Analytics - Indústria Beta</p>
                                                <p class="text-[10px] text-gray-400 mt-0.5">Upsell • Fecha em 14 dias</p>
                                            </td>
                                            <td><span class="badge bg-yellow-soft">Proposta</span></td>
                                            <td class="font-poppins font-medium text-right text-white text-sm">$ 35.500</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <!-- Coluna Estreita: AI War Room Suave -->
                        <div class="glass-card theme-pink !p-5 flex flex-col h-[350px]">
                            <div class="card-content flex flex-col h-full">
                                <div class="flex items-center gap-2 mb-3">
                                    <i class="ph-fill ph-sparkle text-lg text-xPink"></i>
                                    <h3 class="font-poppins font-bold text-sm text-transparent bg-clip-text text-gradient-pink">Intelligence</h3>
                                </div>
                                <p class="text-[11px] text-gray-400 mb-4">Ações sugeridas para maximizar a sua comissão hoje.</p>
                                
                                <div class="space-y-3 overflow-y-auto flex-1 pr-1">
                                    <div class="bg-black/20 border border-white/5 rounded-lg p-3 hover:border-xPink/30 transition-colors">
                                        <div class="flex items-start gap-2">
                                            <i class="ph ph-warning-circle text-xPink mt-0.5"></i>
                                            <div>
                                                <p class="text-xs font-semibold text-white leading-tight">Estagnada</p>
                                                <p class="text-[10px] text-gray-400 mt-1">"Serviços Sec." há 18 dias sem atualização.</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="bg-black/20 border border-white/5 rounded-lg p-3 hover:border-xGreen/30 transition-colors">
                                        <div class="flex items-start gap-2">
                                            <i class="ph ph-money text-xGreen mt-0.5"></i>
                                            <div>
                                                <p class="text-xs font-semibold text-white leading-tight">Fatura Paga</p>
                                                <p class="text-[10px] text-gray-400 mt-1">Fatura do Banco Alfa aprovada. +$850.</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            </div>

            <!-- ========================================== -->
            <!-- ABA 2: MEU PIPELINE (OPORTUNIDADES)        -->
            <!-- ========================================== -->
            <div id="tab-pipeline" class="tab-pane">
                <div class="max-w-[1200px] mx-auto">
                    
                    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                        <div>
                            <h1 class="font-poppins text-xl font-bold text-white">Meu Pipeline</h1>
                            <p class="text-xs text-gray-400 mt-1">Gestão detalhada de oportunidades em andamento.</p>
                        </div>
                        
                        <!-- Filtros -->
                        <div class="flex flex-wrap gap-2">
                            <select class="bg-white/5 border border-white/10 text-[11px] text-white px-3 py-1.5 rounded-lg outline-none font-poppins cursor-pointer">
                                <option class="bg-xDark">Todos os Estágios</option>
                                <option class="bg-xDark">Negociação</option>
                                <option class="bg-xDark">Commit</option>
                            </select>
                            <button class="btn-primary !py-1.5 !px-3 !text-[10px]"><i class="ph ph-plus"></i> Nova Opp</button>
                        </div>
                    </div>

                    <!-- Tabela Suave Expansível -->
                    <div class="glass-card theme-green !p-0 overflow-x-auto rounded-xl">
                        <div class="card-content">
                            <table class="table-glass">
                                <thead>
                                    <tr>
                                        <th class="w-8"></th>
                                        <th>Oportunidade</th>
                                        <th>Tipo</th>
                                        <th>Estágio</th>
                                        <th>Fechamento</th>
                                        <th class="text-right">Margem</th>
                                        <th class="text-center">Score</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    
                                    <!-- DEAL 1 -->
                                    <tr class="deal-row" onclick="toggleDeal('deal-1')">
                                        <td class="text-center"><i class="ph ph-caret-right expand-icon" id="icon-deal-1"></i></td>
                                        <td>
                                            <p class="font-medium text-white text-sm">Migração Cloud AWS</p>
                                            <p class="text-[10px] text-gray-400 mt-0.5">Banco Alfa S.A.</p>
                                        </td>
                                        <td><span class="badge bg-gray-soft">Renovação</span></td>
                                        <td><span class="badge bg-cyan-soft">Negociação</span></td>
                                        <td><span class="text-xs font-medium">15/Out</span></td>
                                        <td class="text-right font-poppins font-medium text-white text-sm">$ 45.000</td>
                                        <td class="flex justify-center"><div class="score-ring high">85</div></td>
                                    </tr>
                                    <tr class="deal-details" id="detail-deal-1">
                                        <td colspan="7">
                                            <div class="details-wrapper">
                                                <div class="flex-1">
                                                    <h4 class="font-poppins text-[10px] uppercase tracking-widest text-xGreen font-semibold mb-2">Next Steps</h4>
                                                    <p class="text-xs text-gray-400 mb-3">Revisão jurídica em andamento. Faltam assinaturas.</p>
                                                    <div class="flex gap-3">
                                                        <span class="badge bg-gray-soft"><i class="ph ph-user"></i> CTO Alfa</span>
                                                        <span class="badge bg-gray-soft"><i class="ph ph-calendar"></i> Call 13/Out</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>

                                    <!-- DEAL 2 -->
                                    <tr class="deal-row" onclick="toggleDeal('deal-2')">
                                        <td class="text-center"><i class="ph ph-caret-right expand-icon" id="icon-deal-2"></i></td>
                                        <td>
                                            <p class="font-medium text-white text-sm">GWS Enterprise</p>
                                            <p class="text-[10px] text-gray-400 mt-0.5">Varejo XYZ Corp.</p>
                                        </td>
                                        <td><span class="badge bg-gray-soft">Net New</span></td>
                                        <td><span class="badge bg-green-soft">Commit</span></td>
                                        <td><span class="text-xs font-medium">20/Out</span></td>
                                        <td class="text-right font-poppins font-medium text-white text-sm">$ 120.000</td>
                                        <td class="flex justify-center"><div class="score-ring high">92</div></td>
                                    </tr>
                                    <tr class="deal-details" id="detail-deal-2">
                                        <td colspan="7">
                                            <div class="details-wrapper">
                                                <div class="flex-1">
                                                    <h4 class="font-poppins text-[10px] uppercase tracking-widest text-xGreen font-semibold mb-2">Billing Status</h4>
                                                    <p class="text-xs text-gray-400 mb-3">Contrato assinado. Aguardando geração de PO.</p>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>

                                    <!-- DEAL 3 -->
                                    <tr class="deal-row">
                                        <td class="text-center"><i class="ph ph-caret-right expand-icon"></i></td>
                                        <td>
                                            <p class="font-medium text-white text-sm">Data Analytics</p>
                                            <p class="text-[10px] text-gray-400 mt-0.5">Indústria Beta</p>
                                        </td>
                                        <td><span class="badge bg-gray-soft">Upsell</span></td>
                                        <td><span class="badge bg-yellow-soft">Proposta</span></td>
                                        <td><span class="text-xs font-medium text-red-400">26/Out</span></td>
                                        <td class="text-right font-poppins font-medium text-white text-sm">$ 35.500</td>
                                        <td class="flex justify-center"><div class="score-ring med">45</div></td>
                                    </tr>

                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            <!-- ========================================== -->
            <!-- ABA 3: ATIVIDADES (CRM TRACKER)            -->
            <!-- ========================================== -->
            <div id="tab-activities" class="tab-pane">
                <div class="max-w-3xl mx-auto">
                    
                    <div class="flex justify-between items-center mb-8">
                        <div>
                            <h1 class="font-poppins text-xl font-bold text-white">Tracker de Atividades</h1>
                        </div>
                        <button class="btn-primary !px-3 !py-1.5" onclick="openLogActivityModal()"><i class="ph ph-plus-circle"></i> Log</button>
                    </div>

                    <div class="glass-card theme-green !p-6">
                        <div class="card-content">
                            
                            <h4 class="font-poppins text-[10px] font-bold text-xGreen uppercase tracking-widest mb-5">Hoje</h4>
                            <div class="timeline">
                                <div class="tl-item">
                                    <div class="tl-dot"></div>
                                    <div class="tl-content">
                                        <div class="flex justify-between mb-1">
                                            <div class="flex items-center gap-2">
                                                <i class="ph-fill ph-phone-call text-xCyan"></i>
                                                <span class="font-medium text-white text-xs">Call de Qualificação</span>
                                            </div>
                                            <span class="text-[9px] text-gray-500">14:30</span>
                                        </div>
                                        <p class="text-[11px] text-gray-400">Cliente indicou que precisa de aprovação da matriz. Resposta até sexta.</p>
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>
                </div>
            </div>

            <!-- ========================================== -->
            <!-- ABA 4: CALCULADORA DE COMISSÃO             -->
            <!-- ========================================== -->
            <div id="tab-calculator" class="tab-pane">
                <div class="max-w-5xl mx-auto">
                    
                    <div class="mb-6">
                        <h1 class="font-poppins text-2xl font-bold text-white">Simulador de Ganhos</h1>
                        <p class="text-xs text-gray-400">Marque as oportunidades para calcular a comissão.</p>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <!-- Coluna: Deals -->
                        <div class="glass-card theme-green !p-5">
                            <div class="card-content">
                                <h3 class="font-poppins font-medium text-white text-sm mb-4">Em Aberto</h3>
                                <div class="space-y-2" id="calc-deals-list">
                                    
                                    <label class="flex items-center justify-between p-3 rounded-lg bg-black/10 border border-white/5 hover:border-xGreen/20 cursor-pointer">
                                        <div class="flex items-center gap-3">
                                            <input type="checkbox" class="sim-checkbox" value="45000" onchange="calcSim()">
                                            <div>
                                                <p class="font-medium text-white text-xs">Migração Cloud AWS</p>
                                            </div>
                                        </div>
                                        <span class="font-poppins font-medium text-white text-xs">$ 45.000</span>
                                    </label>

                                    <label class="flex items-center justify-between p-3 rounded-lg bg-black/10 border border-white/5 hover:border-xGreen/20 cursor-pointer">
                                        <div class="flex items-center gap-3">
                                            <input type="checkbox" class="sim-checkbox" value="120000" onchange="calcSim()" checked>
                                            <div>
                                                <p class="font-medium text-white text-xs">GWS Enterprise</p>
                                            </div>
                                        </div>
                                        <span class="font-poppins font-medium text-white text-xs">$ 120.000</span>
                                    </label>

                                </div>
                            </div>
                        </div>

                        <!-- Coluna: Resultado -->
                        <div class="glass-card theme-green !p-6 border-xGreen/30 bg-xGreen/5">
                            <div class="card-content flex flex-col h-full justify-center text-center">
                                <p class="text-xs text-gray-400 mb-1">Base de Cálculo Simulado</p>
                                <p class="font-poppins text-xl font-bold text-white mb-6" id="sim-base">$ 120.000</p>

                                <div class="mb-6 text-left">
                                    <div class="flex justify-between text-[10px] text-gray-400 mb-2">
                                        <span>Multiplicador (Regra BDM)</span>
                                        <span class="text-white font-mono" id="val-mult">3.0%</span>
                                    </div>
                                    <input type="range" min="1" max="5" step="0.5" value="3" class="range-slider" id="range-mult" oninput="calcSim()">
                                </div>

                                <div class="p-4 rounded-xl bg-black/20 border border-xGreen/20">
                                    <p class="text-[10px] font-poppins text-gray-400 uppercase tracking-widest mb-1">Comissão Final</p>
                                    <p class="font-poppins text-3xl font-bold text-gradient-green" id="sim-result">$ 3.600</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

        </main>
    </div>

    <!-- ── SCRIPTS ── -->
    <script>
        // Theme Toggle Suave
        function toggleTheme() {
            const html = document.documentElement;
            const isDark = html.getAttribute('data-theme') === 'dark';
            const sun = document.querySelector('.ph-sun');
            const moon = document.querySelector('.ph-moon');
            
            if (isDark) {
                html.setAttribute('data-theme', 'light');
                sun.classList.remove('hidden');
                moon.classList.add('hidden');
            } else {
                html.setAttribute('data-theme', 'dark');
                sun.classList.add('hidden');
                moon.classList.remove('hidden');
            }
        }

        // Parallax 3D Suavizado
        document.querySelectorAll('.glass-card').forEach(card => {
            card.addEventListener('mousemove', e => {
                const rect = card.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                
                card.style.setProperty('--mouse-x', `${x}px`);
                card.style.setProperty('--mouse-y', `${y}px`);
                
                // Inclinação muito sutil (divide por um número maior)
                const centerX = rect.width / 2;
                const centerY = rect.height / 2;
                const rotateX = ((y - centerY) / centerY) * -1.5; 
                const rotateY = ((x - centerX) / centerX) * 1.5;
                
                card.style.transform = `perspective(1200px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.01, 1.01, 1.01)`;
            });
            
            card.addEventListener('mouseleave', () => {
                card.style.transform = `perspective(1200px) rotateX(0) rotateY(0) scale3d(1, 1, 1)`;
            });
        });

        // Tabs
        function switchTab(tabId, navElement) {
            document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
            if(navElement) navElement.classList.add('active');
            
            document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));
            document.getElementById('tab-' + tabId).classList.add('active');

            const titles = {
                'dashboard': 'Visão Geral',
                'pipeline': 'Meu Pipeline',
                'activities': 'Tracker de Atividades',
                'calculator': 'Simulador de Comissão'
            };
            if(titles[tabId]) document.getElementById('page-title').textContent = titles[tabId];
        }

        // Accordion Pipeline
        function toggleDeal(dealId) {
            const row = event.currentTarget;
            if (row.classList.contains('active')) {
                row.classList.remove('active');
            } else {
                row.classList.add('active');
            }
        }

        // Calculadora
        function calcSim() {
            const checkboxes = document.querySelectorAll('.sim-checkbox:checked');
            let baseVal = 0;
            checkboxes.forEach(cb => baseVal += parseInt(cb.value));

            const multVal = parseFloat(document.getElementById('range-mult').value);

            document.getElementById('sim-base').textContent = '$ ' + baseVal.toLocaleString('pt-BR');
            document.getElementById('val-mult').textContent = multVal.toFixed(1) + '%';

            const result = baseVal * (multVal / 100);
            document.getElementById('sim-result').textContent = '$ ' + result.toLocaleString('pt-BR', { minimumFractionDigits: 0 });
        }
        calcSim();
    </script>
</body>
</html>