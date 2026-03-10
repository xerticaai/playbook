<!DOCTYPE html>
<html lang="pt-PT" data-theme="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>X-Sales Admin | Governança & Acessos</title>
    
    <!-- Tailwind CSS -->
    <script src="https://cdn.tailwindcss.com"></script>
    
    <!-- Configuração Customizada do Tailwind -->
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    colors: {
                        xCyan: '#00BEFF',
                        xPink: '#FF89FF',
                        xGreen: '#C0FF7D',
                        xDark: '#03070d',
                    },
                    animation: {
                        'grid-flow': 'gridFlow 20s linear infinite',
                        'spin-slow': 'spin 8s linear infinite',
                    },
                    keyframes: {
                        gridFlow: {
                            '0%': { transform: 'translateY(0)' },
                            '100%': { transform: 'translateY(40px)' }
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
           XERTICA.AI BRAND KIT V.2 — DESIGN SYSTEM (ADMIN)
           ============================================================ */
        :root {
            /* Backgrounds */
            --bg-deep: #03070d;
            --bg-surface: rgba(13, 19, 31, 0.4);
            --bg-surface-hover: rgba(20, 29, 46, 0.65);
            
            /* Glassmorphism */
            --glass-border: rgba(255, 255, 255, 0.08);
            --glass-highlight: rgba(255, 255, 255, 0.1);
            
            /* Typography */
            --text-main: #E2E8F0;
            --text-muted: #94A3B8;
            --text-white: #ffffff;
            --text-gray: #8899b0;
            --font-heading: 'Poppins', sans-serif;
            --font-body: 'Roboto', sans-serif;

            /* Brand Glows */
            --x-cyan-50: #00BEFF;
            --x-cyan-glow: rgba(0, 190, 255, 0.5);
            --x-cyan-bg: rgba(0, 190, 255, 0.1);
            
            --x-green-50: #C0FF7D;
            --x-green-glow: rgba(192, 255, 125, 0.45);
            --x-green-bg: rgba(192, 255, 125, 0.1);
            
            --x-pink-50: #FF89FF;
            --x-pink-glow: rgba(255, 137, 255, 0.5);
            --x-pink-bg: rgba(255, 137, 255, 0.1);
        }

        * { box-sizing: border-box; }

        body { 
            margin: 0; 
            font-family: var(--font-body); 
            background-color: var(--bg-deep);
            color: var(--text-main); 
            display: flex; 
            flex-direction: column;
            min-height: 100vh; 
            overflow-x: hidden;
            position: relative;
        }

        /* ── MATERIAIS E TEXTURAS AMBIENTAIS ── */
        .bg-grid-container {
            position: fixed;
            inset: -40px 0 0 0;
            z-index: -2;
            pointer-events: none;
            background-image: 
                linear-gradient(rgba(255, 255, 255, 0.015) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255, 255, 255, 0.015) 1px, transparent 1px);
            background-size: 40px 40px;
            mask-image: radial-gradient(ellipse at top center, black 0%, transparent 80%);
            -webkit-mask-image: radial-gradient(ellipse at top center, black 0%, transparent 80%);
        }

        .noise-overlay {
            position: fixed;
            inset: 0;
            z-index: 999;
            pointer-events: none;
            opacity: 0.035;
            background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
            mix-blend-mode: overlay;
        }

        .bg-orbs {
            position: fixed;
            inset: 0;
            overflow: hidden;
            z-index: -1;
            pointer-events: none;
        }
        .orb {
            position: absolute;
            border-radius: 50%;
            filter: blur(140px);
            opacity: 0.15;
            animation: drift 20s infinite alternate ease-in-out;
        }
        .orb-1 { width: 50vw; height: 50vw; background: var(--x-cyan-50); top: -20%; left: -10%; }
        .orb-2 { width: 45vw; height: 45vw; background: var(--x-pink-50); bottom: -10%; right: -10%; animation-delay: -5s; animation-direction: alternate-reverse; }
        
        @keyframes drift {
            0% { transform: translate(0, 0) scale(1); }
            50% { transform: translate(3vw, 5vh) scale(1.05); }
            100% { transform: translate(-3vw, 2vh) scale(0.95); }
        }

        /* ── NAVBAR ── */
        .hub-navbar {
            background: rgba(3, 7, 13, 0.5); 
            backdrop-filter: blur(24px) saturate(150%);
            -webkit-backdrop-filter: blur(24px) saturate(150%);
            border-bottom: 1px solid var(--glass-border);
            box-shadow: 0 4px 40px rgba(0, 0, 0, 0.6);
            position: sticky;
            top: 0;
            z-index: 1000;
        }

        /* ── COMPONENTS: CARDS & FLASHLIGHT ── */
        .card-container { perspective: 1200px; }
        
        .card {
            background: var(--bg-surface);
            border: 1px solid var(--glass-border);
            border-radius: 20px;
            padding: 24px;
            position: relative;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            box-shadow: 0 15px 35px rgba(0,0,0,0.4), inset 0 1px 0 var(--glass-highlight);
            backdrop-filter: blur(20px) saturate(120%);
            -webkit-backdrop-filter: blur(20px) saturate(120%);
            transform-style: preserve-3d;
            transition: transform 0.1s ease-out, box-shadow 0.4s, border-color 0.4s;
            --mouse-x: 50%;
            --mouse-y: 50%;
        }

        .card-content-layer {
            position: relative;
            z-index: 10;
            transform: translateZ(20px);
            pointer-events: none;
        }

        /* Flashlight Effect */
        .card::before {
            content: ''; position: absolute; inset: 0; border-radius: inherit;
            background: radial-gradient(800px circle at var(--mouse-x) var(--mouse-y), rgba(255, 255, 255, 0.05), transparent 40%);
            opacity: 0; transition: opacity 0.4s ease; z-index: 1; pointer-events: none;
        }
        .card::after {
            content: ''; position: absolute; inset: -1px; border-radius: inherit;
            background: radial-gradient(400px circle at var(--mouse-x) var(--mouse-y), rgba(255, 255, 255, 0.3), transparent 40%);
            z-index: -1; opacity: 0; transition: opacity 0.4s ease;
            -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
            -webkit-mask-composite: xor; mask-composite: exclude; padding: 1px; 
        }

        .card:hover::before, .card:hover::after { opacity: 1; }
        .card.glow-cyan:hover::after { background: radial-gradient(400px circle at var(--mouse-x) var(--mouse-y), var(--x-cyan-50), transparent 40%); }
        .card.glow-cyan:hover { box-shadow: 0 20px 50px -15px var(--x-cyan-glow), inset 0 1px 0 rgba(255,255,255,0.1); border-color: transparent; }

        /* ── TABLE UI PREMIUM (Glassmorphism Data Grid) ── */
        .table-container {
            width: 100%;
            overflow-x: auto;
            border-radius: 16px;
            background: rgba(13, 19, 31, 0.2);
            border: 1px solid var(--glass-border);
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
            text-align: left;
            font-family: var(--font-body);
        }

        th {
            font-family: var(--font-heading);
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: var(--text-muted);
            padding: 16px 24px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            background: rgba(0, 0, 0, 0.2);
            font-weight: 600;
        }

        td {
            padding: 16px 24px;
            font-size: 13px;
            color: var(--text-main);
            border-bottom: 1px solid rgba(255, 255, 255, 0.03);
            vertical-align: middle;
            transition: all 0.2s ease;
        }

        tbody tr {
            transition: all 0.2s ease;
            position: relative;
        }

        tbody tr:hover {
            background: rgba(0, 190, 255, 0.05);
        }

        tbody tr:hover td {
            color: var(--text-white);
        }

        /* Hover indicator left border */
        tbody tr::before {
            content: '';
            position: absolute;
            left: 0; top: 0; bottom: 0;
            width: 2px;
            background: var(--x-cyan-50);
            box-shadow: 0 0 10px var(--x-cyan-50);
            opacity: 0;
            transition: opacity 0.2s ease;
        }
        tbody tr:hover::before { opacity: 1; }

        /* ── BADGES & TAGS ── */
        .badge {
            display: inline-flex;
            align-items: center;
            padding: 4px 12px;
            border-radius: 99px;
            font-size: 10px;
            font-family: var(--font-heading);
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 1px;
            white-space: nowrap;
        }
        
        .badge-cyan { background: var(--x-cyan-bg); border: 1px solid rgba(0, 190, 255, 0.3); color: var(--x-cyan-50); }
        .badge-green { background: var(--x-green-bg); border: 1px solid rgba(192, 255, 125, 0.3); color: var(--x-green-50); }
        .badge-pink { background: var(--x-pink-bg); border: 1px solid rgba(255, 137, 255, 0.3); color: var(--x-pink-50); }
        .badge-outline { background: transparent; border: 1px solid var(--text-gray); color: var(--text-gray); }

        /* ── FORM INPUTS (Retro-Futurist) ── */
        .input-glass {
            width: 100%;
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid var(--glass-border);
            color: var(--text-white);
            padding: 12px 16px;
            border-radius: 12px;
            font-family: var(--font-body);
            font-size: 13px;
            transition: all 0.3s ease;
            outline: none;
        }
        .input-glass:focus {
            background: rgba(0, 190, 255, 0.05);
            border-color: rgba(0, 190, 255, 0.5);
            box-shadow: 0 0 15px rgba(0, 190, 255, 0.2);
        }
        .input-glass::placeholder { color: rgba(255, 255, 255, 0.2); }
        
        .input-label {
            display: block;
            font-family: var(--font-heading);
            font-size: 11px;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 8px;
            font-weight: 600;
        }

        /* ── BUTTONS ── */
        .btn-primary {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            background: var(--x-cyan-bg);
            border: 1px solid rgba(0, 190, 255, 0.4);
            color: var(--x-cyan-50);
            padding: 10px 20px;
            border-radius: 12px;
            font-family: var(--font-heading);
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 1px;
            cursor: pointer;
            transition: all 0.3s ease;
            box-shadow: 0 4px 15px rgba(0, 190, 255, 0.1);
        }
        .btn-primary:hover {
            background: var(--x-cyan-50);
            color: var(--bg-deep);
            box-shadow: 0 8px 25px rgba(0, 190, 255, 0.4);
            transform: translateY(-2px);
        }

        .btn-icon {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 32px;
            border-radius: 8px;
            background: rgba(255,255,255,0.05);
            color: var(--text-muted);
            border: 1px solid transparent;
            transition: all 0.2s;
        }
        .btn-icon:hover {
            background: rgba(0, 190, 255, 0.1);
            color: var(--x-cyan-50);
            border-color: rgba(0, 190, 255, 0.3);
        }

        /* ── MODAL ── */
        .modal-overlay {
            position: fixed; inset: 0; z-index: 99999;
            background: rgba(3, 7, 13, 0.85);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            display: none; align-items: center; justify-content: center;
            opacity: 0; transition: opacity 0.4s ease;
        }
        .modal-overlay.active { display: flex; opacity: 1; }
        
        .modal-card {
            background: rgba(10, 15, 26, 0.95);
            border: 1px solid rgba(0, 190, 255, 0.3);
            box-shadow: 0 20px 80px rgba(0, 190, 255, 0.2), inset 0 0 30px rgba(0,190,255,0.05);
            border-radius: 20px; 
            padding: 32px;
            width: 100%; max-width: 500px;
            transform: translateY(30px) scale(0.95);
            transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .modal-overlay.active .modal-card { transform: translateY(0) scale(1); }

        /* Animações Coreografadas */
        .fade-up { opacity: 0; transform: translateY(20px); animation: fadeUpAnim 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) forwards; }
        .delay-100 { animation-delay: 0.1s; }
        .delay-200 { animation-delay: 0.2s; }
        @keyframes fadeUpAnim { to { opacity: 1; transform: translateY(0); } }
    </style>
</head>
<body>

    <!-- TEXTURA NOISE & GRELHA -->
    <div class="noise-overlay"></div>
    <div class="bg-grid-container animate-grid-flow"></div>
    <div class="bg-orbs"><div class="orb orb-1"></div><div class="orb orb-2"></div></div>

    <!-- ── NAVBAR ── -->
    <nav class="hub-navbar py-3 px-6 sm:px-8 fade-up">
        <div class="max-w-7xl mx-auto flex items-center justify-between">
            <!-- Logo & Contexto -->
            <div class="flex items-center gap-4 cursor-pointer hover:opacity-80 transition-opacity" onclick="window.location.href='index.html'">
                <img src="https://storage.googleapis.com/etp-bucket/Logos%20Xertica.ai%20(.png)/X%20-%20simbolo/Copy%20of%20X_symbol_variation3_Blue_white.png" alt="Xertica X" class="h-6 w-6 object-contain drop-shadow-[0_0_8px_rgba(0,190,255,0.4)]">
                <div class="h-5 w-px bg-white/10 mx-1"></div>
                <span class="font-poppins text-xs font-semibold text-xCyan tracking-[0.2em] uppercase">Admin / RBAC</span>
            </div>
            
            <!-- User Profile -->
            <div class="flex items-center gap-4">
                <div class="text-right hidden md:block">
                    <div class="font-poppins text-[13px] font-semibold text-white">Amália Silva</div>
                    <div class="font-poppins text-[9px] text-xCyan uppercase tracking-[0.2em] font-bold">Diretoria</div>
                </div>
                <div class="h-9 w-9 rounded-full bg-gradient-to-br from-white/10 to-transparent border border-white/20 flex items-center justify-center text-white/80 hover:border-xCyan hover:shadow-[0_0_15px_rgba(0,190,255,0.4)] transition-all cursor-pointer">
                    <i class="ph ph-user text-lg"></i>
                </div>
            </div>
        </div>
    </nav>

    <!-- ── MAIN CONTENT ── -->
    <main class="flex-grow flex flex-col px-4 sm:px-6 lg:px-8 py-10 relative z-10 max-w-7xl mx-auto w-full">
        
        <!-- Header -->
        <div class="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10 fade-up">
            <div>
                <h1 class="font-poppins text-3xl font-bold tracking-tight text-white mb-2 relative inline-block">
                    Gestão de Acessos
                    <span class="absolute -inset-2 bg-xCyan opacity-20 blur-2xl -z-10"></span>
                </h1>
                <p class="font-roboto text-sm text-gray-400 font-light">
                    Controlo de permissões (RBAC) e mapeamento de escopos de vendedores no BigQuery.
                </p>
            </div>
            
            <button onclick="openModal()" class="btn-primary shrink-0">
                <i class="ph ph-plus-circle text-lg"></i> Novo Utilizador
            </button>
        </div>

        <!-- ── KPI BENTO CARDS ── -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 fade-up delay-100">
            <!-- KPI 1 -->
            <div class="card-container">
                <div class="card glow-cyan !p-5">
                    <div class="card-content-layer flex items-center gap-4">
                        <div class="h-12 w-12 rounded-xl bg-xCyan/10 border border-xCyan/30 flex items-center justify-center text-xCyan shadow-[inset_0_0_15px_rgba(0,190,255,0.2)] shrink-0">
                            <i class="ph ph-users text-2xl"></i>
                        </div>
                        <div>
                            <p class="font-poppins text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-1">Total Ativos</p>
                            <p class="font-poppins text-2xl text-white font-bold">142</p>
                        </div>
                    </div>
                </div>
            </div>
            <!-- KPI 2 -->
            <div class="card-container">
                <div class="card glow-cyan !p-5">
                    <div class="card-content-layer flex items-center gap-4">
                        <div class="h-12 w-12 rounded-xl bg-xGreen/10 border border-xGreen/30 flex items-center justify-center text-xGreen shadow-[inset_0_0_15px_rgba(192,255,125,0.2)] shrink-0">
                            <i class="ph ph-target text-2xl"></i>
                        </div>
                        <div>
                            <p class="font-poppins text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-1">Escopos Sales</p>
                            <p class="font-poppins text-2xl text-white font-bold">87</p>
                        </div>
                    </div>
                </div>
            </div>
            <!-- KPI 3 -->
            <div class="card-container">
                <div class="card glow-cyan !p-5">
                    <div class="card-content-layer flex items-center gap-4">
                        <div class="h-12 w-12 rounded-xl bg-xPink/10 border border-xPink/30 flex items-center justify-center text-xPink shadow-[inset_0_0_15px_rgba(255,137,255,0.2)] shrink-0">
                            <i class="ph ph-shield-check text-2xl"></i>
                        </div>
                        <div>
                            <p class="font-poppins text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-1">Auditoria (Hoje)</p>
                            <p class="font-poppins text-2xl text-white font-bold">12 <span class="text-xs text-gray-500 font-normal normal-case">logs reg.</span></p>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- ── TABELA DE UTILIZADORES (Glassmorphism) ── -->
        <div class="card glow-cyan !p-0 !rounded-2xl fade-up delay-200 overflow-hidden">
            <!-- Card Header / Tabs pseudo -->
            <div class="px-6 py-5 border-b border-white/10 bg-black/20 flex flex-wrap gap-6 items-center">
                <div class="font-poppins text-sm font-semibold text-xCyan border-b-2 border-xCyan pb-1">
                    Diretório de Acessos
                </div>
                <div class="font-poppins text-sm font-medium text-gray-500 hover:text-gray-300 cursor-pointer transition-colors pb-1">
                    Trilha de Auditoria
                </div>
                <div class="ml-auto relative">
                    <i class="ph ph-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
                    <input type="text" placeholder="Procurar por email ou nome..." class="input-glass !py-2 !pl-9 !pr-4 !w-64 !bg-transparent !text-xs">
                </div>
            </div>

            <!-- Table -->
            <div class="table-container !border-0 !rounded-none">
                <table>
                    <thead>
                        <tr>
                            <th>Utilizador</th>
                            <th>Role do Sistema</th>
                            <th>Escopo CRM (Vendedor)</th>
                            <th>Status</th>
                            <th class="text-right">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        <!-- Row 1: Admin -->
                        <tr>
                            <td>
                                <div class="flex items-center gap-3">
                                    <div class="h-8 w-8 rounded-full bg-xCyan/20 flex items-center justify-center text-xCyan font-poppins font-bold text-xs">AM</div>
                                    <div>
                                        <div class="font-poppins font-medium text-white text-sm">Amália Silva</div>
                                        <div class="text-xs text-gray-400">amalia.silva@xertica.com</div>
                                    </div>
                                </div>
                            </td>
                            <td><span class="badge badge-cyan"><i class="ph ph-crown mr-1"></i> Admin</span></td>
                            <td><span class="text-gray-500 italic text-xs">Acesso Global (Sem restrição)</span></td>
                            <td><span class="badge badge-outline text-green-400 border-green-400/30 bg-green-400/10">Ativo</span></td>
                            <td class="text-right">
                                <button class="btn-icon"><i class="ph ph-pencil-simple"></i></button>
                                <button class="btn-icon hover:!text-red-400 hover:!bg-red-400/10 hover:!border-red-400/30"><i class="ph ph-prohibit"></i></button>
                            </td>
                        </tr>
                        <!-- Row 2: Sales -->
                        <tr>
                            <td>
                                <div class="flex items-center gap-3">
                                    <div class="h-8 w-8 rounded-full bg-gray-800 flex items-center justify-center text-gray-300 font-poppins font-bold text-xs">CF</div>
                                    <div>
                                        <div class="font-poppins font-medium text-white text-sm">Carlos Ferreira</div>
                                        <div class="text-xs text-gray-400">carlos.f@xertica.com</div>
                                    </div>
                                </div>
                            </td>
                            <td><span class="badge badge-green"><i class="ph ph-currency-dollar mr-1"></i> Sales</span></td>
                            <td>
                                <div class="flex items-center gap-2">
                                    <i class="ph ph-link text-xGreen"></i>
                                    <span class="text-white text-xs font-medium">Carlos Ferreira (BR)</span>
                                </div>
                            </td>
                            <td><span class="badge badge-outline text-green-400 border-green-400/30 bg-green-400/10">Ativo</span></td>
                            <td class="text-right">
                                <button class="btn-icon"><i class="ph ph-pencil-simple"></i></button>
                                <button class="btn-icon hover:!text-red-400 hover:!bg-red-400/10 hover:!border-red-400/30"><i class="ph ph-prohibit"></i></button>
                            </td>
                        </tr>
                        <!-- Row 3: Sales (Multiple) -->
                        <tr>
                            <td>
                                <div class="flex items-center gap-3">
                                    <div class="h-8 w-8 rounded-full bg-gray-800 flex items-center justify-center text-gray-300 font-poppins font-bold text-xs">LM</div>
                                    <div>
                                        <div class="font-poppins font-medium text-white text-sm">Laura Martins</div>
                                        <div class="text-xs text-gray-400">laura.m@xertica.com</div>
                                    </div>
                                </div>
                            </td>
                            <td><span class="badge badge-green"><i class="ph ph-currency-dollar mr-1"></i> Sales</span></td>
                            <td>
                                <div class="flex flex-col gap-1">
                                    <div class="flex items-center gap-2">
                                        <i class="ph ph-link text-xGreen"></i>
                                        <span class="text-white text-xs font-medium">Laura Martins (BR)</span>
                                    </div>
                                    <div class="flex items-center gap-2 opacity-60">
                                        <i class="ph ph-link"></i>
                                        <span class="text-xs">Laura M. BDM</span>
                                    </div>
                                </div>
                            </td>
                            <td><span class="badge badge-outline text-green-400 border-green-400/30 bg-green-400/10">Ativo</span></td>
                            <td class="text-right">
                                <button class="btn-icon"><i class="ph ph-pencil-simple"></i></button>
                                <button class="btn-icon hover:!text-red-400 hover:!bg-red-400/10 hover:!border-red-400/30"><i class="ph ph-prohibit"></i></button>
                            </td>
                        </tr>
                        <!-- Row 4: Automation/Ops -->
                        <tr>
                            <td>
                                <div class="flex items-center gap-3">
                                    <div class="h-8 w-8 rounded-full bg-gray-800 flex items-center justify-center text-gray-300 font-poppins font-bold text-xs">OP</div>
                                    <div>
                                        <div class="font-poppins font-medium text-white text-sm">Sys Ops (Serviço)</div>
                                        <div class="text-xs text-gray-400">ops@xertica.com</div>
                                    </div>
                                </div>
                            </td>
                            <td><span class="badge badge-pink"><i class="ph ph-cpu mr-1"></i> Automation</span></td>
                            <td><span class="text-gray-500 italic text-xs">N/A</span></td>
                            <td><span class="badge badge-outline text-gray-400 border-gray-600 bg-gray-800/50">Inativo</span></td>
                            <td class="text-right">
                                <button class="btn-icon"><i class="ph ph-pencil-simple"></i></button>
                                <button class="btn-icon"><i class="ph ph-arrows-clockwise"></i></button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            
            <div class="px-6 py-4 border-t border-white/5 bg-black/10 flex justify-between items-center">
                <span class="text-xs text-gray-500 font-poppins">Mostrando 4 de 142 registos</span>
                <div class="flex gap-2">
                    <button class="btn-icon !w-auto !px-3 !text-xs font-poppins"><i class="ph ph-caret-left mr-1"></i> Ant</button>
                    <button class="btn-icon !w-auto !px-3 !text-xs font-poppins">Seg <i class="ph ph-caret-right ml-1"></i></button>
                </div>
            </div>
        </div>

    </main>

    <!-- ── MODAL: CADASTRAR UTILIZADOR ── -->
    <div id="userModal" class="modal-overlay">
        <div class="modal-card">
            
            <div class="flex justify-between items-center mb-6">
                <div class="flex items-center gap-3">
                    <div class="h-10 w-10 rounded-lg bg-xCyan/10 border border-xCyan/30 flex items-center justify-center text-xCyan">
                        <i class="ph ph-user-plus text-xl"></i>
                    </div>
                    <h2 class="font-poppins text-lg font-bold text-white tracking-wide">Novo Acesso</h2>
                </div>
                <button onclick="closeModal()" class="text-gray-400 hover:text-white transition-colors">
                    <i class="ph ph-x text-2xl"></i>
                </button>
            </div>

            <form onsubmit="event.preventDefault(); closeModal();" class="space-y-5">
                
                <div>
                    <label class="input-label">Endereço de E-mail (Google Auth)</label>
                    <div class="relative">
                        <i class="ph ph-envelope-simple absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg"></i>
                        <input type="email" required placeholder="nome.sobrenome@xertica.com" class="input-glass pl-11">
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="input-label">Role do Sistema</label>
                        <select class="input-glass appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20fill%3D%22%2394A3B8%22%20viewBox%3D%220%200%2016%2016%22%3E%3Cpath%20d%3D%22M4.646%201.646a.5.5%200%200%201%20.708%200l6%206a.5.5%200%200%201%200%20.708l-6%206a.5.5%200%200%201-.708-.708L10.293%208%204.646%202.354a.5.5%200%200%201%200-.708z%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[position:right_12px_center] bg-[length:12px_12px] pr-10" onchange="toggleSellerScope(this.value)">
                            <option value="sales" class="bg-slate-900">Vendedor (Sales)</option>
                            <option value="admin" class="bg-slate-900">Administrador (Executivo)</option>
                            <option value="automation" class="bg-slate-900">Operações (Automation)</option>
                        </select>
                    </div>
                    <div>
                        <label class="input-label">Status Inicial</label>
                        <select class="input-glass appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20fill%3D%22%2394A3B8%22%20viewBox%3D%220%200%2016%2016%22%3E%3Cpath%20d%3D%22M4.646%201.646a.5.5%200%200%201%20.708%200l6%206a.5.5%200%200%201%200%20.708l-6%206a.5.5%200%200%201-.708-.708L10.293%208%204.646%202.354a.5.5%200%200%201%200-.708z%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[position:right_12px_center] bg-[length:12px_12px] pr-10">
                            <option value="active" class="bg-slate-900">Ativo</option>
                            <option value="inactive" class="bg-slate-900">Inativo</option>
                        </select>
                    </div>
                </div>

                <!-- SEÇÃO CRÍTICA: Mapeamento de Vendedor -->
                <div id="sellerScopeGroup" class="p-4 rounded-xl border border-xGreen/30 bg-xGreen/5 relative overflow-hidden transition-all">
                    <!-- Brilho interno verde -->
                    <div class="absolute -top-10 -right-10 w-24 h-24 bg-xGreen opacity-10 blur-xl rounded-full pointer-events-none"></div>
                    
                    <label class="input-label !text-xGreen flex items-center gap-2">
                        <i class="ph ph-link"></i> Escopo do Vendedor (CRM Mapping)
                    </label>
                    <p class="text-[10px] text-gray-400 mb-3 leading-relaxed">
                        Selecione exatamente como o nome deste vendedor aparece nas tabelas de Pipeline/Faturamento no BigQuery. Isso restringe a Visão Sales apenas a estes dados.
                    </p>
                    
                    <div class="relative">
                        <i class="ph ph-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
                        <input type="text" placeholder="Procurar nome na tabela vw_sales_sellers..." class="input-glass pl-9 !border-xGreen/40 focus:!border-xGreen focus:!shadow-[0_0_15px_rgba(192,255,125,0.2)]">
                    </div>
                    
                    <!-- Exemplo de Multi-select badge (Simulado) -->
                    <div class="flex flex-wrap gap-2 mt-3">
                        <div class="badge bg-xGreen/10 border border-xGreen/40 text-xGreen/90 !font-medium">
                            Carlos Ferreira (BR) <i class="ph ph-x ml-2 cursor-pointer hover:text-white"></i>
                        </div>
                    </div>
                </div>

                <div class="pt-4 flex justify-end gap-3 border-t border-white/10">
                    <button type="button" onclick="closeModal()" class="px-5 py-2 rounded-xl text-xs font-poppins font-semibold text-gray-400 hover:text-white hover:bg-white/5 transition-all uppercase tracking-wide">Cancelar</button>
                    <button type="submit" class="btn-primary !px-6 !shadow-[0_0_20px_rgba(0,190,255,0.2)]">Salvar Permissões <i class="ph ph-check-circle text-base ml-1"></i></button>
                </div>
            </form>
        </div>
    </div>

    <script>
        // JS para Efeitos Parallax e Flashlight (Reaproveitado do Brandbook)
        const cards = document.querySelectorAll('.card');
        
        cards.forEach(card => {
            card.addEventListener('mousemove', e => {
                const rect = card.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                
                card.style.setProperty('--mouse-x', `${x}px`);
                card.style.setProperty('--mouse-y', `${y}px`);
                
                const centerX = rect.width / 2;
                const centerY = rect.height / 2;
                
                const rotateX = ((y - centerY) / centerY) * -4; // Rotação menor para bento boxes pequenos
                const rotateY = ((x - centerX) / centerX) * 4;
                
                card.style.transform = `perspective(1200px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
            });
            
            card.addEventListener('mouseleave', () => {
                card.style.transform = `perspective(1200px) rotateX(0) rotateY(0) scale3d(1, 1, 1)`;
            });
        });

        // Controlo do Modal
        function openModal() {
            document.getElementById('userModal').classList.add('active');
        }

        function closeModal() {
            document.getElementById('userModal').classList.remove('active');
        }

        // Lógica visual para mostrar/esconder campo de mapeamento de vendedor
        function toggleSellerScope(role) {
            const group = document.getElementById('sellerScopeGroup');
            if (role === 'sales') {
                group.style.opacity = '1';
                group.style.height = 'auto';
                group.style.pointerEvents = 'auto';
                group.style.marginTop = '1rem';
            } else {
                group.style.opacity = '0';
                group.style.height = '0px';
                group.style.pointerEvents = 'none';
                group.style.marginTop = '0px';
                group.style.padding = '0px';
                group.style.border = 'none';
            }
        }
    </script>
</body>
</html>
