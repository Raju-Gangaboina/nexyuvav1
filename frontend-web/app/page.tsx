'use client';
import { useEffect, useRef } from 'react';

/* ═══════════════════════════════════════════════════════════════
   NEXYUVA — PRESS START ON YOUR CAREER
   Retro pixel-arcade landing page.
   Markup/CSS/JS below are injected verbatim (dangerouslySetInnerHTML +
   a guarded runtime script) rather than hand-converted to JSX, so the
   pixel-perfect layout, sprite engine, and mini-game interactions match
   the design reference exactly. The <style> tag is scoped to this
   component's lifetime — React removes it from the DOM the moment the
   user navigates away, so its (deliberately generic) class names never
   leak onto other routes.
   ═══════════════════════════════════════════════════════════════ */

const LANDING_CSS = `
:root{
  --blue:#2155FF; --ink:#0A0A0A; --sun:#FFD93B; --paper:#FFFFFF; --red:#FF3B30;
  --shadow:8px 8px 0 var(--ink); --shadow-sm:4px 4px 0 var(--ink);
}
*{margin:0;padding:0;box-sizing:border-box;}
html{scroll-behavior:smooth;}
body{
  background:var(--paper); color:var(--ink);
  font-family:'VT323',monospace; font-size:21px; line-height:1.45;
  overflow-x:hidden;
}
::selection{background:var(--blue); color:#fff;}
::-webkit-scrollbar{width:14px;height:14px;}
::-webkit-scrollbar-track{background:#fff;border-left:3px solid var(--ink);}
::-webkit-scrollbar-thumb{background:var(--blue);border:3px solid var(--ink);}
::-webkit-scrollbar-thumb:hover{background:var(--sun);}
img{max-width:100%;display:block;}
.pxf{font-family:'Press Start 2P',monospace;}
.slf{font-family:'Silkscreen',monospace;}
.wrap{max-width:1220px;margin:0 auto;padding:0 24px;}
a{color:var(--blue);}
button{font-family:inherit;cursor:pointer;}
.svg-sprite{display:inline-block;line-height:0;}
.svg-sprite svg{display:block;shape-rendering:crispEdges;}
.pdrop{filter:drop-shadow(3px 3px 0 var(--ink));}

/* ============ TICKER ============ */
.ticker{background:var(--ink);color:var(--sun);overflow:hidden;white-space:nowrap;border-bottom:4px solid var(--ink);}
.ticker-track{display:inline-flex;padding:7px 0;animation:tick 30s linear infinite;}
.ticker span{font-family:'Press Start 2P',monospace;font-size:10px;letter-spacing:1px;padding:0 18px;}
@keyframes tick{from{transform:translateX(0)}to{transform:translateX(-50%)}}

/* ============ HUD ============ */
.hud{
  position:sticky;top:0;z-index:60;background:#fff;border-bottom:4px solid var(--ink);
}
.hud-in{display:flex;align-items:center;gap:18px;flex-wrap:wrap;padding:10px 24px;max-width:1220px;margin:0 auto;}
.logo{font-family:'Press Start 2P',monospace;font-size:16px;color:var(--blue);text-shadow:3px 3px 0 var(--ink);letter-spacing:1px;text-decoration:none;}
.logo em{font-style:normal;color:var(--sun);-webkit-text-stroke:1px var(--ink);}
.hud-stats{display:flex;gap:16px;align-items:center;margin-left:auto;flex-wrap:wrap;}
.hud-item{font-family:'Press Start 2P',monospace;font-size:9px;background:#fff;border:3px solid var(--ink);padding:6px 9px;box-shadow:3px 3px 0 var(--ink);white-space:nowrap;}
.hud-item b{color:var(--blue);}
#sndBtn{display:flex;align-items:center;gap:6px;background:var(--sun);border:3px solid var(--ink);box-shadow:3px 3px 0 var(--ink);padding:5px 8px;font-family:'Press Start 2P',monospace;font-size:9px;}
#sndBtn:active{transform:translate(2px,2px);box-shadow:1px 1px 0 var(--ink);}

/* ============ GENERIC BITS ============ */
.chip{display:inline-block;font-family:'Press Start 2P',monospace;font-size:10px;border:3px solid var(--ink);padding:7px 11px;background:var(--sun);box-shadow:var(--shadow-sm);transform:rotate(-2deg);}
.chip.blue{background:var(--blue);color:#fff;}
.chip.white{background:#fff;}
.note{
  display:inline-block;font-family:'Silkscreen',monospace;font-size:11px;line-height:1.3;
  border:2px solid var(--ink);background:#fff;padding:5px 9px;box-shadow:3px 3px 0 var(--ink);
  transform:rotate(-3deg);max-width:230px;
}
.btn{
  display:inline-flex;align-items:center;gap:12px;font-family:'Press Start 2P',monospace;font-size:13px;
  background:var(--blue);color:#fff;border:4px solid var(--ink);padding:16px 24px;box-shadow:var(--shadow);
  text-decoration:none;transition:none;
}
.btn:hover{background:#1a44d6;}
.btn:active{transform:translate(5px,5px);box-shadow:3px 3px 0 var(--ink);}
.btn.sun{background:var(--sun);color:var(--ink);}
.btn.white{background:#fff;color:var(--ink);}
.btn.big{font-size:16px;padding:22px 34px;}
.blink{animation:blink 1s steps(2) infinite;}
@keyframes blink{50%{opacity:0;}}
.bob{animation:bob 1.1s steps(2) infinite;}
@keyframes bob{to{transform:translateY(-7px);}}
.spin-slow{animation:spinny 14s steps(24) infinite;}
@keyframes spinny{to{transform:rotate(360deg);}}
section{position:relative;padding:96px 0;}
.sec-head{margin-bottom:54px;}
.sec-title{font-family:'Press Start 2P',monospace;font-size:clamp(22px,3.6vw,40px);line-height:1.35;margin-top:20px;}
.sec-title .b{color:var(--blue);}
.sec-sub{font-size:24px;max-width:720px;margin-top:16px;}
.rv{opacity:0;}
.rv.on{animation:popin .45s steps(4) forwards;}
@keyframes popin{0%{opacity:0;transform:translateY(26px) scale(.97);}100%{opacity:1;transform:none;}}

/* ============ HERO ============ */
.hero{padding:70px 0 110px;position:relative;overflow:hidden;}
.hero-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:40px;align-items:start;}
.hero-kicker{margin-bottom:26px;}
.hero-h1{font-family:'Press Start 2P',monospace;line-height:1.12;letter-spacing:-1px;}
.hl{display:block;}
.hl-get{font-size:clamp(26px,3.4vw,44px);margin-bottom:10px;}
.hl-hired{font-size:clamp(52px,8.4vw,108px);color:var(--blue);text-shadow:6px 6px 0 var(--ink);}
.hl-by{font-size:clamp(22px,3vw,40px);margin:14px 0;}
.hl-by .n7{color:var(--sun);-webkit-text-stroke:2px var(--ink);text-shadow:4px 4px 0 var(--blue);}
.hl-agents{font-size:clamp(34px,5.6vw,74px);color:#fff;
  text-shadow:3px 0 0 var(--ink),-3px 0 0 var(--ink),0 3px 0 var(--ink),0 -3px 0 var(--ink),
  3px 3px 0 var(--ink),-3px 3px 0 var(--ink),3px -3px 0 var(--ink),-3px -3px 0 var(--ink),7px 7px 0 var(--blue);}
.hero-sub{font-size:26px;max-width:560px;margin:30px 0 34px;}
.hero-sub b{background:var(--sun);padding:0 5px;box-shadow:2px 2px 0 var(--ink);}
.hero-cta{display:flex;gap:22px;align-items:center;flex-wrap:wrap;}
.hero-hint{font-family:'Silkscreen',monospace;font-size:12px;margin-top:22px;}
.hero-star-mini{color:var(--sun);-webkit-text-stroke:1px var(--ink);}

/* player card */
.player-card{border:4px solid var(--ink);background:#fff;box-shadow:10px 10px 0 var(--ink);transform:rotate(2deg);position:relative;max-width:400px;margin-left:auto;}
.pc-title{background:var(--ink);color:#fff;font-family:'Press Start 2P',monospace;font-size:10px;padding:9px 12px;display:flex;justify-content:space-between;}
.pc-title .lv{color:var(--sun);}
.pc-img{padding:22px 22px 6px;display:flex;justify-content:center;}
.pc-img img{width:250px;image-rendering:pixelated;mix-blend-mode:multiply;}
.pc-name{font-family:'Press Start 2P',monospace;font-size:13px;text-align:center;padding:6px 12px 0;}
.pc-class{font-family:'Silkscreen',monospace;font-size:11px;text-align:center;color:var(--blue);padding-bottom:10px;}
.pc-bars{padding:8px 22px 18px;display:grid;gap:9px;}
.pc-bar{display:grid;grid-template-columns:96px 1fr;align-items:center;gap:10px;font-family:'Silkscreen',monospace;font-size:11px;}
.bar-cells{display:flex;gap:3px;}
.cell{width:13px;height:13px;border:2px solid var(--ink);background:#fff;}
.cell.on{background:var(--blue);}
.cell.onY{background:var(--sun);}
.pc-status{border-top:4px dashed var(--ink);padding:10px 22px 16px;font-size:19px;}
.pc-status b{color:var(--blue);}
.ready-tag{position:absolute;top:-24px;right:-26px;}
.hero .note{position:absolute;}
.hero-arrow{position:absolute;pointer-events:none;}
.pick-star{position:absolute;background:none;border:none;padding:4px;z-index:5;}
.pick-star:hover{transform:scale(1.2);}
.pick-star.collected{animation:collect .4s steps(4) forwards;}
@keyframes collect{to{transform:scale(2.2) rotate(45deg);opacity:0;}}

/* ============ STATS BAND ============ */
.stats{border-top:4px solid var(--ink);border-bottom:4px solid var(--ink);background:#fff;padding:70px 0;}
.stats-grid{display:grid;grid-template-columns:repeat(12,1fr);gap:24px;align-items:end;}
.stat{position:relative;}
.stat .big{font-family:'Press Start 2P',monospace;line-height:.95;color:var(--blue);text-shadow:5px 5px 0 var(--ink);}
.stat .lbl{font-family:'Silkscreen',monospace;font-size:12px;margin-top:12px;line-height:1.5;max-width:220px;}
.st1{grid-column:1/4;transform:translateY(-14px);}
.st1 .big{font-size:clamp(80px,11vw,160px);}
.st2{grid-column:4/7;}
.st2 .big{font-size:clamp(60px,8vw,110px);color:var(--ink);text-shadow:5px 5px 0 var(--sun);}
.st3{grid-column:7/10;transform:translateY(12px);}
.st3 .big{font-size:clamp(80px,11vw,160px);}
.st4{grid-column:10/13;}
.st4 .big{font-size:clamp(56px,7vw,100px);color:#fff;-webkit-text-stroke:3px var(--ink);text-shadow:6px 6px 0 var(--blue);}
.stat .burst{position:absolute;top:-38px;right:-6px;}

/* burst sticker */
.burst{position:relative;width:110px;height:110px;display:grid;place-items:center;pointer-events:none;}
.burst svg{position:absolute;inset:0;}
.burst span{position:relative;font-family:'Press Start 2P',monospace;font-size:10px;text-align:center;transform:rotate(-10deg);line-height:1.5;z-index:2;}

/* ============ CHARACTER SELECT ============ */
.select-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:34px;margin-top:10px;}
.char{border:4px solid var(--ink);background:#fff;box-shadow:var(--shadow);position:relative;padding:0 0 22px;text-align:center;transition:none;}
.char:nth-child(1){transform:rotate(-1.6deg);}
.char:nth-child(2){transform:translateY(26px);}
.char:nth-child(3){transform:rotate(1.8deg);}
.char:hover{box-shadow:12px 12px 0 var(--ink);}
.char.selected{outline:6px solid var(--blue);outline-offset:4px;}
.char.selected .stamp{display:grid;}
.stamp{display:none;position:absolute;top:-20px;right:-18px;background:var(--red);color:#fff;border:4px solid var(--ink);
  font-family:'Press Start 2P',monospace;font-size:10px;padding:9px 10px;transform:rotate(10deg);place-items:center;box-shadow:4px 4px 0 var(--ink);z-index:3;}
.char-face{padding:26px 0 8px;display:flex;justify-content:center;}
.char-name{font-family:'Press Start 2P',monospace;font-size:14px;}
.char-role{font-family:'Silkscreen',monospace;font-size:11px;color:var(--blue);margin:8px 0 14px;}
.char-bars{padding:0 24px;display:grid;gap:8px;margin-bottom:16px;}
.char-perks{list-style:none;text-align:left;padding:12px 26px 0;border-top:3px dashed var(--ink);margin:0 14px;font-size:20px;}
.char-perks li{padding:4px 0;}
.char-perks li::before{content:"▸ ";color:var(--blue);font-weight:bold;}
.kbd-hint{font-family:'Silkscreen',monospace;font-size:12px;margin-top:44px;text-align:center;}
.kbd{border:2px solid var(--ink);padding:2px 7px;background:#fff;box-shadow:2px 2px 0 var(--ink);margin:0 2px;}

/* ============ LOADOUT ============ */
.inv-top{display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:34px;}
.inv-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:26px;}
.slot{border:4px solid var(--ink);background:#fff;box-shadow:6px 6px 0 var(--ink);padding:18px 18px 14px;position:relative;}
.slot:hover{transform:translate(-3px,-3px);box-shadow:9px 9px 0 var(--ink);}
.slot:hover .slot-ic{animation:bob .5s steps(2) infinite;}
.slot-head{display:flex;gap:14px;align-items:center;margin-bottom:10px;}
.slot-ic{width:56px;height:56px;background:var(--sun);border:3px solid var(--ink);display:grid;place-items:center;flex:none;}
.slot-name{font-family:'Press Start 2P',monospace;font-size:11px;line-height:1.5;}
.slot-desc{font-size:20px;}
.slot-flavor{display:none;font-size:18px;color:var(--blue);margin-top:6px;border-top:2px dashed var(--ink);padding-top:6px;}
.slot:hover .slot-flavor{display:block;}
.rar{position:absolute;top:-12px;right:-10px;font-family:'Press Start 2P',monospace;font-size:8px;border:3px solid var(--ink);padding:4px 7px;box-shadow:3px 3px 0 var(--ink);}
.rar.c{background:#fff;}.rar.r{background:var(--blue);color:#fff;}.rar.e{background:var(--sun);}.rar.l{background:var(--red);color:#fff;}

/* ============ BOSS / AGENTS ============ */
.boss-sec{background:#fff;border-top:4px solid var(--ink);overflow:hidden;}
.giant7{position:absolute;top:-40px;right:-60px;font-family:'Press Start 2P',monospace;font-size:clamp(240px,32vw,460px);
  color:transparent;-webkit-text-stroke:4px var(--blue);opacity:.13;pointer-events:none;user-select:none;line-height:1;}
.boss-head{display:flex;align-items:center;gap:34px;flex-wrap:wrap;margin-bottom:20px;}
.boss-img{width:220px;flex:none;}
.boss-img img{image-rendering:pixelated;mix-blend-mode:multiply;}
.quest{position:relative;margin-top:70px;}
.quest::before{content:"";position:absolute;left:50%;top:0;bottom:0;border-left:6px dashed var(--ink);transform:translateX(-50%);}
.agent{position:relative;width:calc(50% - 76px);margin-bottom:48px;border:4px solid var(--ink);background:#fff;box-shadow:var(--shadow);}
.agent:nth-of-type(odd){margin-right:auto;}
.agent:nth-of-type(even){margin-left:auto;}
.agent:hover{box-shadow:12px 12px 0 var(--ink);transform:translate(-2px,-2px);}
.agent .node{position:absolute;top:26px;width:48px;height:48px;background:var(--blue);color:#fff;border:4px solid var(--ink);
  box-shadow:4px 4px 0 var(--ink);display:grid;place-items:center;font-family:'Press Start 2P',monospace;font-size:13px;z-index:2;}
.agent:nth-of-type(odd) .node{left:calc(100% + 52px);}
.agent:nth-of-type(even) .node{right:calc(100% + 52px);}
.agent-bar{background:var(--ink);color:#fff;font-family:'Press Start 2P',monospace;font-size:11px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;gap:10px;}
.agent-bar .lv{color:var(--sun);}
.agent-flag{background:var(--red);border:3px solid var(--ink);color:#fff;font-size:8px;padding:4px 6px;transform:rotate(3deg);}
.agent-body{padding:20px;}
.agent-toprow{display:flex;gap:16px;align-items:center;margin-bottom:12px;}
.agent-ic{width:64px;height:64px;background:var(--sun);border:3px solid var(--ink);display:grid;place-items:center;flex:none;}
.agent-name{font-family:'Press Start 2P',monospace;font-size:15px;}
.agent-tag{font-family:'Silkscreen',monospace;font-size:11px;color:var(--blue);margin-top:6px;}
.agent-desc{font-size:21px;margin-bottom:8px;}
.agent-deep{font-size:19px;border-top:3px dashed var(--ink);padding-top:10px;margin-top:10px;}
.agent-deep code{font-family:'Silkscreen',monospace;font-size:11px;background:var(--sun);border:2px solid var(--ink);padding:1px 5px;}
.mini-chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;}
.mini-chip{font-family:'Silkscreen',monospace;font-size:10px;border:2px solid var(--ink);background:#fff;padding:3px 7px;box-shadow:2px 2px 0 var(--ink);}
.agent-stats{display:flex;gap:22px;margin-top:14px;font-family:'Silkscreen',monospace;font-size:10px;align-items:center;flex-wrap:wrap;}
.pips{display:inline-flex;gap:3px;}
.pip{width:12px;height:12px;border:2px solid var(--ink);background:#fff;display:inline-block;}
.pip.on{background:var(--blue);}
.pip.onY{background:var(--sun);}

/* ============ ENGINE ============ */
.engine-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:44px;align-items:start;}
.terminal{background:var(--ink);color:#fff;border:4px solid var(--ink);box-shadow:var(--shadow);}
.term-bar{background:var(--blue);padding:8px 12px;font-family:'Press Start 2P',monospace;font-size:9px;display:flex;justify-content:space-between;color:#fff;border-bottom:4px solid var(--ink);}
.term-body{padding:22px;font-family:'VT323',monospace;font-size:19px;line-height:1.7;min-height:380px;}
.tl{opacity:0;white-space:pre-wrap;word-break:break-word;}
.tl.on{animation:tlin .12s steps(2) forwards;}
@keyframes tlin{to{opacity:1;}}
.tp{color:var(--sun);} .tb{color:#7ea2ff;} .tc{color:#9a9a9a;font-size:16px;} .tr{color:var(--red);}
.cursor{display:inline-block;width:11px;height:20px;background:var(--sun);animation:blink .8s steps(2) infinite;vertical-align:middle;}
.ladder{border:4px solid var(--ink);background:#fff;box-shadow:var(--shadow);padding:22px;}
.ladder h3{font-family:'Press Start 2P',monospace;font-size:13px;margin-bottom:18px;}
.lad-row{display:flex;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap;}
.lad-box{border:3px solid var(--ink);padding:10px 12px;font-family:'Press Start 2P',monospace;font-size:10px;background:#fff;box-shadow:4px 4px 0 var(--ink);}
.lad-box.ok{background:var(--blue);color:#fff;}
.lad-box.warn{background:var(--sun);}
.lad-box.bad{background:var(--red);color:#fff;}
.lad-arr{font-family:'Press Start 2P',monospace;font-size:14px;}
.quota{margin-top:26px;border-top:3px dashed var(--ink);padding-top:18px;}
.quota h4{font-family:'Silkscreen',monospace;font-size:12px;margin-bottom:10px;}
.qbar{display:flex;gap:4px;}
.qcell{width:22px;height:26px;border:3px solid var(--ink);background:var(--blue);}
.qcell.off{background:#fff;}
.qnote{font-size:18px;margin-top:10px;}
.rules{margin-top:26px;display:grid;gap:12px;}
.rule{display:flex;gap:12px;align-items:center;border:3px solid var(--ink);background:#fff;box-shadow:4px 4px 0 var(--ink);padding:10px 14px;font-size:20px;}
.rule .num{font-family:'Press Start 2P',monospace;font-size:10px;background:var(--sun);border:2px solid var(--ink);padding:5px 7px;flex:none;}

/* ============ LOOT / DATA MODEL ============ */
.loot-grid{display:flex;flex-wrap:wrap;gap:34px;justify-content:center;}
.card{width:330px;border:4px solid var(--ink);background:#fff;box-shadow:var(--shadow);position:relative;}
.card:nth-child(1){transform:rotate(-2.4deg);}
.card:nth-child(2){transform:rotate(1.6deg) translateY(22px);}
.card:nth-child(3){transform:rotate(-1.2deg);}
.card:nth-child(4){transform:rotate(2.2deg) translateY(14px);}
.card:nth-child(5){transform:rotate(-1.8deg) translateY(-8px);}
.card:hover{transform:rotate(0) translateY(-8px);z-index:4;}
.card-head{background:var(--blue);color:#fff;font-family:'Press Start 2P',monospace;font-size:10px;padding:10px 12px;display:flex;justify-content:space-between;align-items:center;border-bottom:4px solid var(--ink);gap:8px;}
.card-rar{font-size:8px;background:var(--sun);color:var(--ink);border:2px solid var(--ink);padding:3px 6px;flex:none;}
.card-rar.l{background:var(--red);color:#fff;}
.card-fields{padding:14px;font-size:19px;}
.field{display:flex;justify-content:space-between;gap:10px;padding:4px 0;border-bottom:2px dashed #d8d8d8;}
.field:last-child{border-bottom:none;}
.field .fn{color:var(--blue);font-weight:bold;}
.field .ft{color:var(--ink);text-align:right;font-size:17px;}
.key{font-family:'Silkscreen',monospace;font-size:9px;border:2px solid var(--ink);padding:0 4px;background:var(--sun);margin-left:5px;vertical-align:middle;}
.card-foot{border-top:3px dashed var(--ink);padding:9px 14px;font-family:'Silkscreen',monospace;font-size:10px;}

/* ============ QUEST LIFECYCLE ============ */
.quest-sec{border-top:4px solid var(--ink);}
.life-row{display:grid;grid-template-columns:repeat(4,1fr);gap:0;align-items:stretch;position:relative;margin-top:20px;}
.life-node{border:4px solid var(--ink);background:#fff;box-shadow:var(--shadow);padding:22px 18px;position:relative;text-align:center;}
.life-node:nth-child(1){transform:rotate(-1.5deg);}
.life-node:nth-child(2){transform:translateY(22px) rotate(1deg);}
.life-node:nth-child(3){transform:translateY(-8px);}
.life-node:nth-child(4){transform:translateY(30px) rotate(1.6deg);}
.life-word{font-family:'Press Start 2P',monospace;font-size:13px;margin:12px 0 8px;}
.life-desc{font-size:19px;}
.life-arrow{position:absolute;top:50%;right:-32px;z-index:3;transform:translateY(-50%);}
.life-node.gold{background:var(--sun);}
.cert-row{margin-top:74px;display:flex;align-items:center;gap:18px;flex-wrap:wrap;border:4px dashed var(--ink);padding:18px 22px;font-size:22px;}
.cert-row img{width:74px;image-rendering:pixelated;mix-blend-mode:multiply;}

/* ============ CTA ============ */
.cta{text-align:center;padding:120px 0 130px;overflow:hidden;position:relative;}
.cta-title{font-family:'Press Start 2P',monospace;font-size:clamp(26px,5vw,58px);line-height:1.3;}
.cta-title .b{color:var(--blue);text-shadow:5px 5px 0 var(--sun);}
.cta-sub{font-size:25px;margin:22px auto 40px;max-width:640px;}
.coin-btn{position:relative;display:inline-flex;flex-direction:column;align-items:center;gap:14px;background:var(--sun);border:5px solid var(--ink);
  box-shadow:10px 10px 0 var(--ink);padding:30px 46px;font-family:'Press Start 2P',monospace;font-size:18px;}
.coin-btn:hover .coin{animation:coindrop .5s steps(5) infinite;}
.coin-btn:active{transform:translate(6px,6px);box-shadow:4px 4px 0 var(--ink);}
@keyframes coindrop{0%{transform:translateY(-16px) rotate(0)}100%{transform:translateY(6px) rotate(0)}}
.cta-or{display:flex;gap:22px;justify-content:center;margin-top:44px;flex-wrap:wrap;}
.cont{font-family:'Press Start 2P',monospace;font-size:12px;margin-top:44px;}
.cont b{color:var(--red);}

/* ============ FOOTER ============ */
footer{background:var(--ink);color:#fff;border-top:6px solid var(--blue);}
.foot-marquee{overflow:hidden;white-space:nowrap;border-bottom:3px solid #333;padding:12px 0;}
.foot-track{display:inline-flex;animation:tick 40s linear infinite;}
.foot-track span{font-family:'Press Start 2P',monospace;font-size:10px;color:var(--sun);padding:0 20px;}
.foot-in{display:flex;justify-content:space-between;align-items:center;gap:20px;flex-wrap:wrap;padding:26px 24px;max-width:1220px;margin:0 auto;font-family:'Silkscreen',monospace;font-size:11px;}
.foot-in .heart{color:var(--red);}
.foot-links{display:flex;gap:14px;flex-wrap:wrap;}
.foot-links a{color:#fff;text-decoration:none;border:2px solid #fff;padding:4px 8px;}
.foot-links a:hover{background:var(--blue);border-color:var(--blue);}

/* ============ TOASTS ============ */
.toasts{position:fixed;top:80px;right:18px;z-index:100;display:flex;flex-direction:column;gap:14px;pointer-events:none;}
.toast{background:#fff;border:4px solid var(--ink);box-shadow:6px 6px 0 var(--ink);width:300px;animation:toastin .3s steps(4);}
.toast .t-head{background:var(--ink);color:var(--sun);font-family:'Press Start 2P',monospace;font-size:9px;padding:7px 10px;display:flex;gap:8px;align-items:center;}
.toast .t-body{padding:10px 12px;font-size:19px;display:flex;gap:10px;align-items:center;}
@keyframes toastin{from{transform:translateX(120%);}to{transform:none;}}
.toast.out{animation:toastout .3s steps(4) forwards;}
@keyframes toastout{to{transform:translateX(130%);}}
.rain-star{position:fixed;top:-60px;z-index:99;pointer-events:none;animation:fall linear forwards;}
@keyframes fall{to{transform:translateY(110vh) rotate(180deg);}}

/* ============ RESPONSIVE ============ */
@media(max-width:980px){
  .hero-grid{grid-template-columns:1fr;}
  .player-card{margin:30px auto 0;}
  .stats-grid{grid-template-columns:repeat(2,1fr);}
  .st1,.st2,.st3,.st4{grid-column:auto;transform:none;}
  .select-grid{grid-template-columns:1fr;max-width:460px;margin:0 auto;}
  .char:nth-child(2){transform:none;}
  .inv-grid{grid-template-columns:repeat(2,1fr);}
  .engine-grid{grid-template-columns:1fr;}
  .quest::before,.agent .node{display:none;}
  .agent{width:100%;}
  .life-row{grid-template-columns:repeat(2,1fr);gap:34px;}
  .life-arrow{display:none;}
  .giant7{font-size:220px;opacity:.08;}
}
@media(max-width:620px){
  body{font-size:19px;}
  .inv-grid{grid-template-columns:1fr;}
  .life-row{grid-template-columns:1fr;}
  .hud-item.hide-sm{display:none;}
  .agent:nth-of-type(even){margin-left:0;}
  .cta-or{flex-direction:column;align-items:center;}
}
@media(prefers-reduced-motion:reduce){
  *,*::before,*::after{animation:none!important;transition:none!important;}
  .rv{opacity:1;}
}
`;

const LANDING_BODY = `

<!-- TICKER -->
<div class="ticker" aria-hidden="true">
  <div class="ticker-track" id="tickerTrack">
    <span>★ NEXYUVA v2.0 LOADED</span><span>★ 7 HIRING AGENTS ONLINE</span><span>★ RESUME PARSER: READY</span><span>★ GROQ: WARM</span><span>★ 0 RAW ERRORS SHOWN TO PLAYERS</span><span>★ CERTIFICATES: SHINY</span><span>★ PRESS START ★</span>
  </div>
</div>

<!-- HUD -->
<header class="hud">
  <div class="hud-in">
    <a class="logo" href="#top">NEX<em>YUVA</em></a>
    <div class="hud-stats">
      <span class="hud-item hide-sm">WORLD <b>1-1</b></span>
      <span class="hud-item">SCORE <b id="scoreVal">000000</b></span>
      <span class="hud-item">★×<b id="coinVal">00</b></span>
      <button id="sndBtn" aria-label="toggle sound"><span class="svg-sprite" data-sprite="spk" data-px="3"></span><span id="sndTxt">ON</span></button>
      <a href="/login" class="hud-item" id="loginHudBtn" style="text-decoration:none;color:var(--ink);display:flex;align-items:center;gap:6px;">▸ LOG IN</a>
    </div>
  </div>
</header>

<main id="top">

<!-- ================= HERO ================= -->
<section class="hero" data-ach="PROFILE CREATED — WELCOME, PLAYER 1">
  <div class="wrap hero-grid">
    <div style="position:relative;">
      <div class="hero-kicker"><span class="chip">ACHIEVEMENT SCREEN — CAREER MODE</span></div>
      <h1 class="hero-h1">
        <span class="hl hl-get">GET</span>
        <span class="hl hl-hired">HIRED.</span>
        <span class="hl hl-by">BY <span class="n7">7</span> AI AGENTS</span>
        <span class="hl hl-agents">AT ONCE</span>
      </h1>
      <p class="hero-sub">NexYuva is a placement platform where students level up and companies unleash <b>seven AI agents</b> to find them. No doomscrolling. No ghosting. Just XP, badges and offer letters.</p>
      <div class="hero-cta">
        <a href="#select" class="btn big" id="startBtn"><span class="blink">▶</span> PRESS START</a>
        <span class="note">free to play* <br>*no credit-card boss fight</span>
      </div>
      <div class="hero-hint"><span class="hero-star-mini">★</span> TIP: CLICK THE FLOATING STARS. THEY'RE WORTH POINTS. <span class="hero-star-mini">★</span></div>
    </div>

    <div style="position:relative;">
      <div class="player-card rv">
        <div class="pc-title"><span>PLAYER CARD</span><span class="lv">LV.1</span></div>
        <div class="pc-img"><span class="svg-sprite" data-sprite="mascot" data-px="11" style="mix-blend-mode:multiply;"></span></div>
        <div class="pc-name">YOU (YES, YOU)</div>
        <div class="pc-class">CLASS: STUDENT — UNDECIDED BUT AMBITIOUS</div>
        <div class="pc-bars" data-bars-json='[["SKILLS",3],["RESUME",5],["CONFIDENCE",9],["COFFEE",10]]'></div>
        <div class="pc-status">STATUS: <b>browsing jobs at 2AM</b> · BUFF: <b>hope (+10)</b></div>
        <div class="ready-tag burst" data-burst="READY?"></div>
      </div>
      <span class="note" style="bottom:-30px;left:-8px;transform:rotate(2deg);">this could be you.<br>(it is you.)</span>
      <svg class="hero-arrow" style="left:-90px;top:-40px;width:120px;" viewBox="0 0 120 90" fill="none">
        <path d="M8 10 C 55 4, 90 25, 104 66" stroke="#0A0A0A" stroke-width="5" stroke-linecap="square"/>
        <path d="M104 66 l-16 -6 M104 66 l-2 -17" stroke="#0A0A0A" stroke-width="5" stroke-linecap="square"/>
      </svg>
      <button class="pick-star" style="top:-26px;right:60px;" aria-label="collect star"><span class="svg-sprite bob" data-sprite="star" data-px="6"></span></button>
    </div>
  </div>
  <button class="pick-star" style="top:90px;left:44%;" aria-label="collect star"><span class="svg-sprite bob" data-sprite="star" data-px="5"></span></button>
  <button class="pick-star" style="bottom:60px;left:6%;" aria-label="collect star"><span class="svg-sprite bob" data-sprite="star" data-px="7"></span></button>
</section>

<!-- ================= STATS ================= -->
<div class="stats">
  <div class="wrap">
    <div class="stats-grid">
      <div class="stat st1 rv"><div class="big">7</div><div class="lbl">AI HIRING AGENTS<br>ON THE COMPANY PAYROLL</div></div>
      <div class="stat st2 rv"><div class="big">&lt;3s</div><div class="lbl">VOICE SCREEN<br>ROUND-TRIP LATENCY</div></div>
      <div class="stat st3 rv"><div class="big">3</div><div class="lbl">FALLBACK TIERS.<br>ZERO RAW ERRORS SHOWN.</div>
        <div class="burst" data-burst="SAFE!"></div></div>
      <div class="stat st4 rv"><div class="big">20→1</div><div class="lbl">RATIONALES BATCHED<br>INTO A SINGLE PROMPT</div></div>
    </div>
  </div>
</div>

<!-- ================= CHARACTER SELECT ================= -->
<section id="select" data-ach="CHARACTER SELECTED — CHOOSE WISELY">
  <div class="wrap">
    <div class="sec-head rv">
      <span class="chip blue">SELECT SCREEN</span>
      <h2 class="sec-title">CHOOSE YOUR <span class="b">PLAYER</span></h2>
      <p class="sec-sub">Three classes. One platform. Every flow is role-based — JWT armor included, profile management standard issue.</p>
    </div>
    <div class="select-grid">
      <article class="char rv" data-pick="STUDENT" data-href="/login?role=student" tabindex="0">
        <div class="stamp">P1<br>READY!</div>
        <div class="char-face"><span class="svg-sprite pdrop" data-sprite="fStudent" data-px="9"></span></div>
        <div class="char-name">STUDENT</div>
        <div class="char-role">CLASS: JOB HUNTER / XP FARMER</div>
        <div class="char-bars" data-bars-json='[["GRIND",9],["LUCK",7],["COFFEE",10]]'></div>
        <ul class="char-perks">
          <li>One-click apply sprees</li>
          <li>Resume auto-parsed (PDF/DOCX)</li>
          <li>Certificates drop on completion</li>
        </ul>
      </article>
      <article class="char rv" data-pick="ORGANIZATION" data-href="/login?role=company" tabindex="0">
        <div class="stamp">P2<br>READY!</div>
        <div class="char-face"><span class="svg-sprite pdrop" data-sprite="fOrg" data-px="9"></span></div>
        <div class="char-name">ORGANIZATION</div>
        <div class="char-role">CLASS: QUEST GIVER / BOSS SUMMONER</div>
        <div class="char-bars" data-bars-json='[["HIRING PWR",9],["SCHEDULE",10],["PATIENCE",8]]'></div>
        <ul class="char-perks">
          <li>Post quests, unleash 7 agents</li>
          <li>Calendar auto-books interviews</li>
          <li>Only humans shortlist humans</li>
        </ul>
      </article>
      <article class="char rv" data-pick="ADMIN" data-href="/login?role=admin" tabindex="0">
        <div class="stamp">P3<br>READY!</div>
        <div class="char-face"><span class="svg-sprite pdrop" data-sprite="fAdmin" data-px="9"></span></div>
        <div class="char-name">ADMIN</div>
        <div class="char-role">CLASS: OMNISCIENT DUNGEON MASTER</div>
        <div class="char-bars" data-bars-json='[["SIGHT",10],["COFFEE",2],["POWER",10]]'></div>
        <ul class="char-perks">
          <li>Sees every dashboard</li>
          <li>RAG bot answers ops questions</li>
          <li>Event bus keeps the mail flying</li>
        </ul>
      </article>
    </div>
    <div class="kbd-hint rv">PRESS <span class="kbd">1</span> <span class="kbd">2</span> <span class="kbd">3</span> OR CLICK TO SELECT — APPLICATION LIFECYCLE: APPLIED → SHORTLISTED → COMPLETED → WITHDRAWN</div>
  </div>
</section>

<!-- ================= LOADOUT ================= -->
<section id="loadout" data-ach="FULLY EQUIPPED — 9/9 SLOTS">
  <div class="wrap">
    <div class="sec-head rv">
      <span class="chip">INVENTORY</span>
      <h2 class="sec-title">STUDENT <span class="b">LOADOUT</span> — 9/9 SLOTS EQUIPPED</h2>
      <p class="sec-sub">The existing AI/ML arsenal, already live on the student side. Hover an item to read its flavor text.</p>
    </div>
    <div class="inv-grid">
      <div class="slot rv"><span class="rar r">RARE</span>
        <div class="slot-head"><span class="slot-ic svg-sprite" data-sprite="doc" data-px="5"></span><span class="slot-name">ATS RESUME SCAN</span></div>
        <div class="slot-desc">Deterministic checks + a Groq qualitative pass. Your resume vs. the robot gatekeepers.</div>
        <div class="slot-flavor">» beat the boss before the boss sees you</div>
      </div>
      <div class="slot rv"><span class="rar e">EPIC</span>
        <div class="slot-head"><span class="slot-ic svg-sprite" data-sprite="cpu" data-px="5"></span><span class="slot-name">HYBRID RECOMMENDER</span></div>
        <div class="slot-desc">Skill-vector cosine similarity + bonus factors. Every match ships with an XAI “why this job”.</div>
        <div class="slot-flavor">» explainable, or it didn't happen</div>
      </div>
      <div class="slot rv"><span class="rar e">EPIC</span>
        <div class="slot-head"><span class="slot-ic svg-sprite" data-sprite="chart" data-px="5"></span><span class="slot-name">CAREER PATH ORACLE</span></div>
        <div class="slot-desc">Career path prediction + skill-gap analysis. Where you're headed, computed.</div>
        <div class="slot-flavor">» crystal ball, but with math</div>
      </div>
      <div class="slot rv"><span class="rar r">RARE</span>
        <div class="slot-head"><span class="slot-ic svg-sprite" data-sprite="mag" data-px="5"></span><span class="slot-name">GITHUB SCORE</span></div>
        <div class="slot-desc">Profile scoring cached in Redis. Your commits, quantified and brag-ready.</div>
        <div class="slot-flavor">» green squares = currency</div>
      </div>
      <div class="slot rv"><span class="rar c">COMMON</span>
        <div class="slot-head"><span class="slot-ic svg-sprite" data-sprite="shield" data-px="5"></span><span class="slot-name">LINKEDIN VERIFIED</span></div>
        <div class="slot-desc">OAuth verification. Blue-check energy without paying for blue checks.</div>
        <div class="slot-flavor">» trust, but verify</div>
      </div>
      <div class="slot rv"><span class="rar e">EPIC</span>
        <div class="slot-head"><span class="slot-ic svg-sprite" data-sprite="badge" data-px="5"></span><span class="slot-name">PROCTORED BADGES</span></div>
        <div class="slot-desc">Supervised skill assessments → shiny equippable badges.</div>
        <div class="slot-flavor">» no second tabs were opened</div>
      </div>
      <div class="slot rv"><span class="rar l">LEGENDARY</span>
        <div class="slot-head"><span class="slot-ic svg-sprite" data-sprite="chat" data-px="5"></span><span class="slot-name">RAG CAREER MENTOR</span></div>
        <div class="slot-desc">FAQ-first chatbot, pgvector search, Groq fallback. Never says “as an AI”.</div>
        <div class="slot-flavor">» asks nothing stupid, answers everything</div>
      </div>
      <div class="slot rv"><span class="rar l">LEGENDARY</span>
        <div class="slot-head"><span class="slot-ic svg-sprite" data-sprite="map" data-px="5"></span><span class="slot-name">ROADMAP + AI TUTOR</span></div>
        <div class="slot-desc">SVG dependency-graph canvas, per-topic tutor in 10 modes, static project-idea generator.</div>
        <div class="slot-flavor">» the skill tree is literally a tree</div>
      </div>
      <div class="slot rv"><span class="rar r">RARE</span>
        <div class="slot-head"><span class="slot-ic svg-sprite" data-sprite="mail" data-px="5"></span><span class="slot-name">EVENT-BUS MAIL</span></div>
        <div class="slot-desc">Email notifications fire on every status change. The postman is an event bus.</div>
        <div class="slot-flavor">» you've got mail. again.</div>
      </div>
    </div>
  </div>
</section>

<!-- ================= BOSS: HIRING SUITE ================= -->
<section id="agents" class="boss-sec" data-ach="WORLD 7 UNLOCKED — THE HIRING SUITE">
  <div class="giant7">7</div>
  <div class="wrap">
    <div class="boss-head rv">
      <div>
        <span class="chip blue">NEW DLC ★ COMPANY SIDE</span>
        <h2 class="sec-title" style="margin-top:20px;">WORLD 7:<br>THE <span class="b">AI HIRING SUITE</span></h2>
        <p class="sec-sub">Seven agents. Each one clears a stage of hiring. None of them sleep, ghost, or “circle back next quarter”.</p>
      </div>
      <div class="boss-img"><span class="svg-sprite bob" data-sprite="boss" data-px="12" style="mix-blend-mode:multiply;"></span></div>
      <span class="note" style="transform:rotate(3deg);">7 agents. 0 mercy.<br>1 shared AgentResult&lt;T&gt;</span>
    </div>

    <div class="quest">
      <article class="agent rv">
        <span class="node">01</span>
        <div class="agent-bar"><span><span class="lv">LV.01</span> SOURCING</span><span class="agent-flag">NEW!</span></div>
        <div class="agent-body">
          <div class="agent-toprow"><span class="agent-ic svg-sprite" data-sprite="mag" data-px="6"></span>
            <div><div class="agent-name">SOURCING</div><div class="agent-tag">RANKS THE ENTIRE CANDIDATE POOL</div></div></div>
          <p class="agent-desc">Local TF / skill-overlap math ranks every candidate for a posting — <b>zero LLM calls per candidate</b>.</p>
          <p class="agent-deep">Groq writes a 1–2 sentence rationale for the top-N only — batched <code>20 per prompt</code>, cached per <code>(candidate, posting)</code> pair.</p>
          <div class="mini-chips"><span class="mini-chip">LOCAL TF-IDF</span><span class="mini-chip">SKILL OVERLAP</span><span class="mini-chip">CACHE: (C, P)</span></div>
          <div class="agent-stats"><span>SPEED <span class="pips" data-pips="5,5"></span></span><span>LLM SPEND <span class="pips" data-pips="1,5Y"></span></span></div>
        </div>
      </article>

      <article class="agent rv">
        <span class="node">02</span>
        <div class="agent-bar"><span><span class="lv">LV.02</span> SCREENING</span><span class="agent-flag">NEW!</span></div>
        <div class="agent-body">
          <div class="agent-toprow"><span class="agent-ic svg-sprite" data-sprite="doc" data-px="6"></span>
            <div><div class="agent-name">SCREENING</div><div class="agent-tag">ONE RESUME × ONE POSTING</div></div></div>
          <p class="agent-desc">Groq returns strict JSON: <b>{fitScore, strengths[], gaps[], rationale}</b>. One verdict-shaped object.</p>
          <p class="agent-deep">Malformed JSON → retry once → fall back to local TF score. Scanned/unreadable resume → <code>needs_manual_review</code>. <b>Never scored blind.</b></p>
          <div class="mini-chips"><span class="mini-chip">STRICT JSON</span><span class="mini-chip">RETRY ×1</span><span class="mini-chip">LOCAL TF FALLBACK</span></div>
          <div class="agent-stats"><span>ACCURACY <span class="pips" data-pips="4,5"></span></span><span>SAFETY <span class="pips" data-pips="5,5Y"></span></span></div>
        </div>
      </article>

      <article class="agent rv">
        <span class="node">03</span>
        <div class="agent-bar"><span><span class="lv">LV.03</span> ASSESSMENT</span><span class="agent-flag">NEW!</span></div>
        <div class="agent-body">
          <div class="agent-toprow"><span class="agent-ic svg-sprite" data-sprite="cpu" data-px="6"></span>
            <div><div class="agent-name">ASSESSMENT</div><div class="agent-tag">GENERATES QUIZZES + CODING CHALLENGES</div></div></div>
          <p class="agent-desc">Groq generates skill-specific MCQs and coding challenges on demand. Fresh papers, every time.</p>
          <p class="agent-deep">MCQs auto-graded locally — <b>answer keys never touch the client</b>. Free-response items get a separate, scoped Groq grading call at submission.</p>
          <div class="mini-chips"><span class="mini-chip">MCQ AUTO-GRADE</span><span class="mini-chip">KEYS SERVER-SIDE</span><span class="mini-chip">SCOPED GRADING</span></div>
          <div class="agent-stats"><span>GENERATION <span class="pips" data-pips="4,5"></span></span><span>FAIRNESS <span class="pips" data-pips="5,5Y"></span></span></div>
        </div>
      </article>

      <article class="agent rv">
        <span class="node">04</span>
        <div class="agent-bar"><span><span class="lv">LV.04</span> INTERVIEW — AI-LED</span><span class="agent-flag">NEW!</span></div>
        <div class="agent-body">
          <div class="agent-toprow"><span class="agent-ic svg-sprite" data-sprite="cam" data-px="6"></span>
            <div><div class="agent-name">AI INTERVIEW</div><div class="agent-tag">WEBCAM ROUND, FULLY REFEREED</div></div></div>
          <p class="agent-desc">Extends the student MediaPipe webcam flow with a company review dashboard.</p>
          <p class="agent-deep">Adaptive Groq follow-up questions, structured per-question scoring, and <code>session-resume</code> when the connection drops mid-answer. Proctoring = timestamped flags, not video hoarding.</p>
          <div class="mini-chips"><span class="mini-chip">MEDIPIPE</span><span class="mini-chip">SESSION-RESUME</span><span class="mini-chip">PER-Q SCORING</span></div>
          <div class="agent-stats"><span>ADAPTIVE <span class="pips" data-pips="4,5"></span></span><span>PROCTORING <span class="pips" data-pips="5,5Y"></span></span></div>
        </div>
      </article>

      <article class="agent rv">
        <span class="node">05</span>
        <div class="agent-bar"><span><span class="lv">LV.05</span> SMART SCHEDULING</span><span class="agent-flag">NEW!</span></div>
        <div class="agent-body">
          <div class="agent-toprow"><span class="agent-ic svg-sprite" data-sprite="cal" data-px="6"></span>
            <div><div class="agent-name">SMART SCHEDULING</div><div class="agent-tag">THE ONLY AGENT WITH A CALENDAR</div></div></div>
          <p class="agent-desc">Per-company Google Calendar OAuth → freebusy query vs. candidate availability → auto-book with a Meet link.</p>
          <p class="agent-deep">Token dies? <b>Reconnect prompt.</b> Zero overlap? It offers <code>near-miss slots</code> instead of rage-quitting. “Let's find a time” — actually found.</p>
          <div class="mini-chips"><span class="mini-chip">G-CAL OAUTH</span><span class="mini-chip">FREEBUSY</span><span class="mini-chip">NEAR-MISS SLOTS</span></div>
          <div class="agent-stats"><span>RELIABILITY <span class="pips" data-pips="5,5"></span></span><span>MERCY <span class="pips" data-pips="4,5Y"></span></span></div>
        </div>
      </article>

      <article class="agent rv">
        <span class="node">06</span>
        <div class="agent-bar"><span><span class="lv">LV.06</span> ASSISTED INTERVIEW</span><span class="agent-flag">NEW!</span></div>
        <div class="agent-body">
          <div class="agent-toprow"><span class="agent-ic svg-sprite" data-sprite="chat" data-px="6"></span>
            <div><div class="agent-name">ASSISTED HUMAN INTERVIEW</div><div class="agent-tag">HUMAN DRIVES. AI WHISPERS.</div></div></div>
          <p class="agent-desc">Your interviewer runs the show. After each answer, Groq suggests follow-ups in a recruiter-only sidebar.</p>
          <p class="agent-deep"><b>Never visible to the candidate. Never makes pass/fail calls. Ever.</b> It's a wingman, not a judge.</p>
          <div class="mini-chips"><span class="mini-chip">RECRUITER-ONLY SIDEBAR</span><span class="mini-chip">NO PASS/FAIL. EVER.</span></div>
          <div class="agent-stats"><span>HUMAN CONTROL <span class="pips" data-pips="5,5"></span></span><span>WHISPER QI <span class="pips" data-pips="4,5Y"></span></span></div>
        </div>
      </article>

      <article class="agent rv">
        <span class="node">07</span>
        <div class="agent-bar"><span><span class="lv">LV.07</span> VOICE SCREEN</span><span class="agent-flag">NEW!</span></div>
        <div class="agent-body">
          <div class="agent-toprow"><span class="agent-ic svg-sprite" data-sprite="mic" data-px="6"></span>
            <div><div class="agent-name">VOICE SCREEN</div><div class="agent-tag">FORMERLY “CALLING AGENT” — NOW 100% IN-BROWSER</div></div></div>
          <p class="agent-desc">Mic → chunked audio → Groq Whisper STT → Groq completion → browser SpeechSynthesis TTS. A real conversation, no phone involved.</p>
          <p class="agent-deep">Target round-trip: <b>&lt;2–3 seconds</b>. No SpeechSynthesis support? Instant <code>text-chat fallback</code>. The call is coming from inside the browser.</p>
          <div class="mini-chips"><span class="mini-chip">WHISPER STT</span><span class="mini-chip">SPEECHSYNTH TTS</span><span class="mini-chip">TEXT FALLBACK</span></div>
          <div class="agent-stats"><span>SPEED <span class="pips" data-pips="4,5"></span></span><span>FALLBACKS <span class="pips" data-pips="5,5Y"></span></span></div>
        </div>
      </article>
    </div>
  </div>
</section>

<!-- ================= ENGINE ROOM ================= -->
<section id="engine" data-ach="READ THE SOURCE — +50 INT">
  <div class="wrap">
    <div class="sec-head rv">
      <span class="chip white">CHEAT CODES</span>
      <h2 class="sec-title">THE <span class="b">ENGINE ROOM</span></h2>
      <p class="sec-sub">Shared hiring-suite infrastructure. One failure path. One envelope. Zero drama reaching the player.</p>
    </div>
    <div class="engine-grid">
      <div class="terminal rv">
        <div class="term-bar"><span>NEXYUVA://INFRA — GROQ_CLIENT.TS</span><span>TTY1</span></div>
        <div class="term-body" id="termBody">
<div class="tl"><span class="tp">&gt;</span> <span class="tb">type AgentResult&lt;T&gt;</span> = { status, data, meta, error } <span class="tc">// one envelope, all 7 agents</span></div>
<div class="tl"><span class="tp">&gt;</span> groqClient :: retry → timeout → <span class="tr">429 backoff</span> → structured-parse</div>
<div class="tl"><span class="tp">&gt;</span> degradation: NORMAL ▸ BACKOFF ▸ QUEUE/LOCAL <span class="tc">// raw errors never reach users</span></div>
<div class="tl"><span class="tp">&gt;</span> quota[company].groq_today → throttle <span class="tb">SOURCING</span> before <span class="tb">VOICE</span>/<span class="tb">INTERVIEW</span></div>
<div class="tl"><span class="tp">&gt;</span> batch_mode: <span class="tr">20 rationales == 1 prompt</span> <span class="tc">// not 20 calls</span></div>
<div class="tl"><span class="tp">&gt;</span> guard: ⟨⟨ untrusted resume text ⟩⟩ treated as <span class="tb">DATA</span> — scores clamped server-side</div>
<div class="tl"><span class="tp">&gt;</span> media: raw audio → object_store(<span class="tb">ref</span>) · proctor → flag[]@t <span class="tc">// no blobs in Postgres</span></div>
<div class="tl"><span class="tp">&gt;</span> log{ agent, model, latency_ms, tokens, fallback_used } → debug + budget</div>
<div class="tl"><span class="tp">&gt;</span> build complete. have fun. <span class="cursor"></span></div>
        </div>
      </div>
      <div>
        <div class="ladder rv">
          <h3>DEGRADATION LADDER</h3>
          <div class="lad-row"><span class="lad-box ok">NORMAL</span><span class="lad-arr">──429!?──▶</span><span class="lad-box warn">EXP. BACKOFF</span><span class="lad-arr">──still?──▶</span><span class="lad-box bad">QUEUE / LOCAL FALLBACK</span></div>
          <div class="quota">
            <h4>TODAY'S GROQ BUDGET — ACME CORP</h4>
            <div class="qbar" id="quotaBar"></div>
            <div class="qnote">When the meter runs low, <b>Sourcing</b> gets throttled first. Candidate-facing agents eat last... no wait, <i>first</i>.</div>
          </div>
        </div>
        <div class="rules rv">
          <div class="rule"><span class="num">R1</span> Untrusted text is <b>&nbsp;data&nbsp;</b>, never instructions. Prompt-injection guarded.</div>
          <div class="rule"><span class="num">R2</span> Scores are clamped server-side, no matter what the model says.</div>
          <div class="rule"><span class="num">R3</span> Every LLM call logs agent, model, latency, tokens, fallback-used.</div>
          <div class="rule"><span class="num">R4</span> Audio stored by reference. Postgres stays slim. The blob monster is fed elsewhere.</div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ================= LOOT / DATA MODEL ================= -->
<section id="loot" data-ach="PATCH NOTES ABSORBED">
  <div class="wrap">
    <div class="sec-head rv">
      <span class="chip">PATCH NOTES v2.0</span>
      <h2 class="sec-title">NEW <span class="b">LOOT</span> IN THE DATA MODEL</h2>
      <p class="sec-sub">Five brand-new entities dropped this season. Collect them all (your ORM will).</p>
    </div>
    <div class="loot-grid">
      <div class="card rv">
        <div class="card-head"><span>◆ CANDIDATE</span><span class="card-rar">EPIC</span></div>
        <div class="card-fields">
          <div class="field"><span class="fn">id<span class="key">PK</span></span><span class="ft">uuid</span></div>
          <div class="field"><span class="fn">skills</span><span class="ft">text[]</span></div>
          <div class="field"><span class="fn">resume_ref</span><span class="ft">storage</span></div>
          <div class="field"><span class="fn">github_score</span><span class="ft">int (cached)</span></div>
          <div class="field"><span class="fn">linkedin_verified</span><span class="ft">bool</span></div>
          <div class="field"><span class="fn">badges</span><span class="ft">badge[]</span></div>
          <div class="field"><span class="fn">availability</span><span class="ft">jsonb</span></div>
        </div>
        <div class="card-foot">DROP RATE: EVERY SIGN-UP ★ THE PLAYER CHARACTER</div>
      </div>
      <div class="card rv">
        <div class="card-head"><span>◆ SCREENING_RESULT</span><span class="card-rar l">LEGENDARY</span></div>
        <div class="card-fields">
          <div class="field"><span class="fn">id<span class="key">PK</span></span><span class="ft">uuid</span></div>
          <div class="field"><span class="fn">candidate_id<span class="key">FK</span></span><span class="ft">→ Candidate</span></div>
          <div class="field"><span class="fn">posting_id<span class="key">FK</span></span><span class="ft">→ Posting</span></div>
          <div class="field"><span class="fn">fit_score</span><span class="ft">int 0–100, clamped</span></div>
          <div class="field"><span class="fn">strengths / gaps</span><span class="ft">text[]</span></div>
          <div class="field"><span class="fn">rationale</span><span class="ft">text</span></div>
          <div class="field"><span class="fn">fallback_used</span><span class="ft">bool</span></div>
          <div class="field"><span class="fn">needs_manual_review</span><span class="ft">bool</span></div>
        </div>
        <div class="card-foot">STRICT JSON OR IT DIDN'T HAPPEN</div>
      </div>
      <div class="card rv">
        <div class="card-head"><span>◆ ASSESSMENT_ATTEMPT</span><span class="card-rar">RARE</span></div>
        <div class="card-fields">
          <div class="field"><span class="fn">id<span class="key">PK</span></span><span class="ft">uuid</span></div>
          <div class="field"><span class="fn">candidate_id<span class="key">FK</span></span><span class="ft">→ Candidate</span></div>
          <div class="field"><span class="fn">mcq_score</span><span class="ft">int (local grade)</span></div>
          <div class="field"><span class="fn">free_response</span><span class="ft">PENDING|GRADED</span></div>
          <div class="field"><span class="fn">proctor_flags</span><span class="ft">flag[] @t</span></div>
          <div class="field"><span class="fn">submitted_at</span><span class="ft">timestamptz</span></div>
        </div>
        <div class="card-foot">ANSWER KEYS STAY ON THE SERVER</div>
      </div>
      <div class="card rv">
        <div class="card-head"><span>◆ INTERVIEW_SESSION</span><span class="card-rar l">LEGENDARY</span></div>
        <div class="card-fields">
          <div class="field"><span class="fn">id<span class="key">PK</span></span><span class="ft">uuid</span></div>
          <div class="field"><span class="fn">candidate_id<span class="key">FK</span></span><span class="ft">→ Candidate</span></div>
          <div class="field"><span class="fn">mode</span><span class="ft">AI | ASSISTED | VOICE</span></div>
          <div class="field"><span class="fn">questions / scores</span><span class="ft">jsonb[]</span></div>
          <div class="field"><span class="fn">proctor_flags</span><span class="ft">flag[] @t</span></div>
          <div class="field"><span class="fn">resumed_at</span><span class="ft">timestamptz?</span></div>
          <div class="field"><span class="fn">recording_ref</span><span class="ft">storage?</span></div>
        </div>
        <div class="card-foot">DROPPED CONNECTION? SESSION RESUMES.</div>
      </div>
      <div class="card rv">
        <div class="card-head"><span>◆ SCHEDULED_INTERVIEW</span><span class="card-rar">RARE</span></div>
        <div class="card-fields">
          <div class="field"><span class="fn">id<span class="key">PK</span></span><span class="ft">uuid</span></div>
          <div class="field"><span class="fn">session_id<span class="key">FK</span></span><span class="ft">→ InterviewSession</span></div>
          <div class="field"><span class="fn">google_event_id</span><span class="ft">text</span></div>
          <div class="field"><span class="fn">meet_link</span><span class="ft">text</span></div>
          <div class="field"><span class="fn">slot_source</span><span class="ft">AUTO | NEAR_MISS</span></div>
          <div class="field"><span class="fn">status</span><span class="ft">BOOKED | CANCELLED</span></div>
        </div>
        <div class="card-foot">AUTO-BOOKED. MEET LINK INCLUDED.</div>
      </div>
    </div>
  </div>
</section>

<!-- ================= MAIN QUEST LIFECYCLE ================= -->
<section id="quest" class="quest-sec" data-ach="QUEST ACCEPTED — MAIN STORYLINE">
  <div class="wrap">
    <div class="sec-head rv">
      <span class="chip blue">MAIN QUEST</span>
      <h2 class="sec-title">THE APPLICATION <span class="b">LIFECYCLE</span></h2>
      <p class="sec-sub">Four checkpoints. Every transition fires an event-bus email. Every finish line drops a certificate.</p>
    </div>
    <div class="life-row">
      <div class="life-node rv">
        <span class="svg-sprite pdrop" data-sprite="doc" data-px="5"></span>
        <div class="life-word">APPLIED</div>
        <div class="life-desc">One click. Resume parsed. Quest accepted.</div>
        <svg class="life-arrow" width="60" height="30" viewBox="0 0 60 30"><path d="M2 15 H48 M48 15 l-12 -9 M48 15 l-12 9" stroke="#0A0A0A" stroke-width="5" fill="none" stroke-linecap="square"/></svg>
      </div>
      <div class="life-node rv">
        <span class="svg-sprite pdrop" data-sprite="star" data-px="5"></span>
        <div class="life-word">SHORTLISTED</div>
        <div class="life-desc">The agents whispered your name. Loudly.</div>
        <svg class="life-arrow" width="60" height="30" viewBox="0 0 60 30"><path d="M2 15 H48 M48 15 l-12 -9 M48 15 l-12 9" stroke="#0A0A0A" stroke-width="5" fill="none" stroke-linecap="square"/></svg>
      </div>
      <div class="life-node gold rv">
        <span class="svg-sprite pdrop" data-sprite="badge" data-px="5"></span>
        <div class="life-word">COMPLETED</div>
        <div class="life-desc"><b>CERTIFICATE DROP!</b> +1★ to your profile.</div>
        <svg class="life-arrow" width="60" height="30" viewBox="0 0 60 30"><path d="M2 15 H48 M48 15 l-12 -9 M48 15 l-12 9" stroke="#0A0A0A" stroke-width="5" fill="none" stroke-linecap="square"/></svg>
      </div>
      <div class="life-node rv">
        <span class="svg-sprite pdrop" data-sprite="ghost" data-px="5"></span>
        <div class="life-word">WITHDRAWN</div>
        <div class="life-desc">No hard feelings. Respawn anytime.</div>
      </div>
    </div>
    <div class="cert-row rv">
      <span class="svg-sprite" data-sprite="trophy" data-px="7" style="mix-blend-mode:multiply;"></span>
      <span><b>LOOT SECURED:</b> auto-generated certificate on completion, mailed instantly by the event bus.</span>
      <span class="svg-sprite bob" data-sprite="mail" data-px="4" style="margin-left:auto;"></span>
      <span class="note" style="transform:rotate(2deg);">event-bus mail:<br>status change → inbox</span>
    </div>
  </div>
</section>

<!-- ================= CTA ================= -->
<section id="start" class="cta" data-ach="CONTINUE? YES. ALWAYS YES.">
  <button class="pick-star" style="top:60px;left:12%;" aria-label="collect star"><span class="svg-sprite bob" data-sprite="star" data-px="6"></span></button>
  <button class="pick-star" style="bottom:120px;right:10%;" aria-label="collect star"><span class="svg-sprite bob" data-sprite="star" data-px="5"></span></button>
  <div class="wrap">
    <h2 class="cta-title rv">READY,<br><span class="b">PLAYER YOU?</span></h2>
    <p class="cta-sub rv">Students: insert resume. Companies: insert coin. The agents are already warming up.</p>
    <button class="coin-btn rv" id="coinBtn">
      <span class="svg-sprite coin pdrop" data-sprite="coin" data-px="7"></span>
      INSERT COIN
    </button>
    <div class="cta-or rv">
      <a href="#select" class="btn">▶ PLAY AS STUDENT</a>
      <a href="#agents" class="btn sun">▶ PLAY AS COMPANY</a>
    </div>
    <div class="cont rv blink">CONTINUE? <b id="contNum">9</b>… DON'T WORRY, WE DON'T COUNT DOWN TO GAME OVER.</div>
  </div>
</section>
</main>

<!-- FOOTER -->
<footer>
  <div class="foot-marquee" aria-hidden="true">
    <div class="foot-track" id="footTrack">
      <span>THANKS FOR PLAYING</span><span>★ NEXYUVA © 2026</span><span>★ NO PIXELS WERE HARMED</span><span>★ POWERED BY GROQ + PGVECTOR + MEDIAPIPE + REDIS</span><span>★ INSERT RESUME TO CONTINUE</span><span>★ HI-SCORE BELONGS TO YOU</span>
    </div>
  </div>
  <div class="foot-in">
    <span>NEXYUVA — MADE WITH <span class="heart">♥</span> AND 8 BITS</span>
    <div class="foot-links">
      <a href="#loadout">LOADOUT</a><a href="#agents">AGENTS</a><a href="#loot">DATA</a><a href="#top">↑ TOP</a>
    </div>
    <span>BUILD v2.0 ★ SAVE POINT REACHED</span>
  </div>
</footer>

<div class="toasts" id="toasts"></div>
`;

/* ============ PIXEL SPRITE ENGINE ============ */
const PAL: Record<string, string> = { Y: '#FFD93B', B: '#2155FF', K: '#0A0A0A', W: '#FFFFFF', R: '#FF3B30' };
const SPRITES: Record<string, string[]> = {
  star: ["....Y....", "...YYY...", "YYYYYYYYY", ".YYYYYYY.", "..YYYYY..", ".YYY.YYY.", ".YY...YY.", ".Y.....Y."],
  coin: ["..YYYY..", ".YWWYYY.", "YYWYYYYY", "YYYYYYYY", "YYYYYYYY", "YYYYYYYY", ".YYYYYY.", "..YYYY.."],
  heart: [".RR...RR.", "RRRR.RRRR", "RRRRRRRRR", "RRRRRRRRR", ".RRRRRRR.", "..RRRRR..", "...RRR...", "....R...."],
  mail: ["BBBBBBBBBB", "BBWBBBBWBB", "BBBWBBWBBB", "BBBBWWBBBB", "BBBBBBBBBB", "BBBBBBBBBB", "BBBBBBBBBB"],
  doc: ["KKKKKKKK", "KWWWWWWK", "KWBBBBWK", "KWWWWWWK", "KWBBBWWK", "KWWWWWWK", "KWBBBBWK", "KWWWWWWK", "KWWWWWWK", "KKKKKKKK"],
  mag: [".KKKKK..", "KWWWWWK.", "KWWWWWK.", "KWWWWWK.", ".KKKKK..", "....KK..", ".....KK.", "......KK"],
  cpu: ["..K.K.K..", "KKKKKKKKK", "KBBBBBBBK", "KBBWWWBBK", "KBBWWWBBK", "KBBBBBBBK", "KKKKKKKKK", "..K.K.K.."],
  chart: [".......B.", "......BB.", ".B.......", ".B..B....", ".B..B....", ".B..B..B.", ".B..B..B.", "KKKKKKKKK"],
  badge: ["..YYYY..", ".YYYYYY.", "YYYBBYYY", ".YYYYYY.", "..YYYY..", "..B..B..", ".BB..BB.", ".B....B."],
  shield: ["BBBBBBBB", "BBBBBBBB", "BBWWWWBB", "BBWWWWBB", ".BBBBBB.", ".BBBBBB.", "..BBBB..", "...BB..."],
  chat: [".KKKKKKKK.", "KWWWWWWWWK", "KWBWWBWWBK", "KWWWWWWWWK", ".KKKKKKKK.", "...KWWK...", "..KWWK....", ".KK......."],
  map: ["KKKKKKKKKK", "KWWWBWWWWK", "KWWBBWWWWK", "KWWWWBWWWK", "KWWWWBBWWK", "KWWWWWWBWK", "KWWWWWWBYK", "KKKKKKKKKK"],
  cam: [".KKKKKKKK.", "KKKKKKKKKK", "KKKBBBBKKK", "KKBBWBBKKK", "KKKBBBBKKK", "KKKKKKKKKK", "..KKKKKK..", ".KK....KK."],
  mic: [".KKKKK.", ".KBBBK.", ".KBBBK.", ".KBBBK.", ".KKKKK.", "...K...", "...K...", "..KKK..", ".KKKKK."],
  cal: ["..K...K..", "KKKKKKKKK", "KWWWWWWWK", "KWBBBWWWK", "KWBBBWWWK", "KWWWWWWWK", "KWWWWBBWK", "KWWWWWWWK", "KKKKKKKKK"],
  ghost: ["..KKKKK..", ".KWWWWWK.", "KWWWWWWWK", "KWKKWKKWK", "KWWWWWWWK", "KWWWWWWWK", "KWWWWWWWK", "KWKWKWKWK"],
  chest: [".KKKKKKKK.", "KBBBBBBBBK", "KBBBBBBBBK", "KKKKKKKKKK", "KBBBYYBBBK", "KBBBYYBBBK", "KBBBBBBBBK", ".KKKKKKKK."],
  fStudent: ["..BBBBBB..", ".BBBBBBBB.", "BBBBBBBBBB", "..WWWWWW..", "..WKWWKW..", "..WWWWWW..", "..WKKKKW..", "...WWWW...", "..BBBBBB..", ".BBBBBBBB."],
  fOrg: ["..KKKKKK..", ".KKKKKKKK.", "..WWWWWW..", "..WKWWKW..", "..WWWWWW..", "..WKKKKW..", "...WWWW...", "..KKKKKK..", ".KKKBBKKK.", ".KKKKKKKK."],
  fAdmin: ["..Y.YY.Y..", "..YYYYYY..", "..WWWWWW..", "..WKWWKW..", "..WWWWWW..", "..WKKKKW..", "...WWWW...", "..BBBBBB..", ".BBBBBBBB.", ".BBBBBBBB."],
  spk: ["...KK....", "..KWWK...", ".KKWWK.B.", "KWWWWK..B", "KWWWWK..B", ".KKWWK.B.", "..KWWK...", "...KK...."],
  mut: ["...KK....", "..KWWK...", ".KKWWK.R.", "KWWWWKR..", "KWWWWK.R.", ".KKWWK..R", "..KWWK...", "...KK...."],
  mascot: ["..BBBBBB..", ".BBBBBBBB.", "BBBBBBBBBB", "..WWWWWW..", "..WKWWKW..", "..WWWWWW..", "..WKKKKW..", "...WWWW...", "..YYYYYY..", ".YYYYYYYY.", "..YYYYYY..", "..BB..BB..", ".BBB..BBB.", ".BBB..BBB."],
  boss: ["..KKKKKKKKKK..", ".KKKKKKKKKKKK.", "KKBBBBBBBBBBKK", "KBBYYBBBBYYBBK", "KBBYYBBBBYYBBK", "KBBBBBBBBBBBBK", "KKBBBBBBBBBBKK", "..KKKKKKKKKK..", ".KK.KKKKKK.KK.", "KKK.KKKKKK.KKK", ".KK..KKKK..KK.", "..KK......KK..", "...KK....KK...", "...KK....KK..."],
  trophy: [".YYYYYY.", "YYYYYYYY", "YKYYYYKY", ".YYYYYY.", "..YYYY..", "...YY...", "..YYYY..", ".YYYYYY.", "YYYYYYYY"],
};

function spriteSVG(name: string, px?: number): string {
  const p = px || 6;
  const rows = SPRITES[name];
  if (!rows) return '';
  const h = rows.length, w = rows[0].length;
  let r = '';
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      const ch = rows[y][x];
      if (ch !== '.' && PAL[ch]) r += `<rect x="${x * p}" y="${y * p}" width="${p}" height="${p}" fill="${PAL[ch]}"/>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w * p} ${h * p}" width="${w * p}" height="${h * p}" shape-rendering="crispEdges">${r}</svg>`;
}

export default function Page() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const cleanups: Array<() => void> = [];
    const timers: any[] = [];

    root.querySelectorAll<HTMLElement>('.svg-sprite[data-sprite]').forEach((el) => {
      el.innerHTML = spriteSVG(el.dataset.sprite || '', parseInt(el.dataset.px || '6', 10));
    });

    root.querySelectorAll<HTMLElement>('[data-bars-json]').forEach((el) => {
      const data = JSON.parse(el.dataset.barsJson || '[]');
      let html = '';
      data.forEach((row: [string, number]) => {
        html += `<div class="pc-bar"><span>${row[0]}</span><span class="bar-cells">`;
        for (let i = 0; i < 10; i++) html += `<span class="cell ${i < row[1] ? (row[1] >= 9 ? 'onY' : 'on') : ''}"></span>`;
        html += `</span></div>`;
      });
      el.innerHTML = html;
    });
    root.querySelectorAll<HTMLElement>('.pips[data-pips]').forEach((el) => {
      const parts = (el.dataset.pips || '').split(',');
      const val = parseInt(parts[0], 10), max = parseInt(parts[1], 10);
      let html = '';
      for (let i = 0; i < max; i++) html += `<span class="pip ${i < val ? 'on' : ''}"></span>`;
      el.innerHTML = html;
    });

    root.querySelectorAll<HTMLElement>('[data-burst]').forEach((el) => {
      const pts: string[] = [];
      const cx = 55, cy = 55;
      for (let i = 0; i < 24; i++) {
        const rr = i % 2 === 0 ? 52 : 34;
        const a = (i / 24) * Math.PI * 2 - Math.PI / 2;
        pts.push(`${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`);
      }
      el.innerHTML = `<svg viewBox="0 0 110 110" class="spin-slow"><polygon points="${pts.join(' ')}" fill="#FFD93B" stroke="#0A0A0A" stroke-width="4"/></svg><span>${el.dataset.burst}</span>`;
    });

    let AC: AudioContext | null = null;
    let muted = false;
    function tone(f: number, d: number, t?: number) {
      if (muted) return;
      try {
        AC = AC || new ((window as any).AudioContext || (window as any).webkitAudioContext)();
        const ctx: AudioContext = AC as AudioContext;
        if (ctx.state === 'suspended') ctx.resume();
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'square'; o.frequency.value = f;
        const st = ctx.currentTime + (t || 0);
        g.gain.setValueAtTime(0.045, st);
        g.gain.exponentialRampToValueAtTime(0.001, st + (d || 0.08));
        o.connect(g); g.connect(ctx.destination);
        o.start(st); o.stop(st + (d || 0.08) + 0.02);
      } catch { /* ignore */ }
    }
    const SFX = {
      blip: () => tone(880, .05, 0),
      beep: () => tone(660, .07, 0),
      collect: () => { tone(880, .06, 0); tone(1108, .06, .06); tone(1318, .09, .12); },
      ach: () => { tone(523, .09, 0); tone(659, .09, .09); tone(784, .09, .18); tone(1046, .16, .27); },
      start: () => { tone(262, .09, 0); tone(392, .09, .09); tone(523, .09, .18); tone(784, .2, .27); },
      god: () => { tone(392, .1, 0); tone(523, .1, .1); tone(659, .1, .2); tone(784, .1, .3); tone(1046, .3, .4); },
    };

    const blipEls = root.querySelectorAll<HTMLElement>('a,.btn,.char,#coinBtn,.pick-star,#sndBtn');
    const onBlip = () => SFX.blip();
    blipEls.forEach((el) => el.addEventListener('mouseenter', onBlip));
    cleanups.push(() => blipEls.forEach((el) => el.removeEventListener('mouseenter', onBlip)));

    const sndBtn = root.querySelector<HTMLButtonElement>('#sndBtn');
    const sndTxt = root.querySelector<HTMLElement>('#sndTxt');
    const onSndClick = () => {
      muted = !muted;
      const spriteHost = sndBtn?.querySelector<HTMLElement>('.svg-sprite');
      if (spriteHost) spriteHost.innerHTML = spriteSVG(muted ? 'mut' : 'spk', 3);
      if (sndTxt) sndTxt.textContent = muted ? 'OFF' : 'ON';
      if (!muted) SFX.beep();
    };
    sndBtn?.addEventListener('click', onSndClick);
    if (sndBtn) cleanups.push(() => sndBtn.removeEventListener('click', onSndClick));

    let baseScore = 0, bonus = 0, stars = 0;
    const scoreEl = root.querySelector<HTMLElement>('#scoreVal');
    const coinEl = root.querySelector<HTMLElement>('#coinVal');
    const pad6 = (n: number) => String(Math.min(n, 999999)).padStart(6, '0');
    const refreshHUD = () => {
      if (scoreEl) scoreEl.textContent = pad6(baseScore + bonus);
      if (coinEl) coinEl.textContent = String(stars).padStart(2, '0');
    };
    const onScroll = () => { baseScore = Math.floor(window.scrollY / 6); refreshHUD(); };
    window.addEventListener('scroll', onScroll, { passive: true });
    cleanups.push(() => window.removeEventListener('scroll', onScroll));
    refreshHUD();

    const toastsEl = root.querySelector<HTMLElement>('#toasts');
    function toast(title: string, msg: string, snd?: () => void) {
      if (!toastsEl) return;
      const t = document.createElement('div');
      t.className = 'toast';
      t.innerHTML = `<div class="t-head">${spriteSVG('star', 2)} ${title}</div><div class="t-body">${spriteSVG('badge', 3)} <span>${msg}</span></div>`;
      toastsEl.appendChild(t);
      if (snd) snd();
      timers.push(setTimeout(() => t.classList.add('out'), 4200));
      timers.push(setTimeout(() => t.remove(), 4600));
    }

    const achObs = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        const target = en.target as HTMLElement;
        if (en.isIntersecting && !target.dataset.achDone) {
          target.dataset.achDone = '1';
          toast('ACHIEVEMENT UNLOCKED', target.dataset.ach || '', SFX.ach);
          bonus += 100; refreshHUD();
        }
      });
    }, { threshold: 0.25 });
    root.querySelectorAll<HTMLElement>('[data-ach]').forEach((el) => achObs.observe(el));

    let termStarted = false;
    function startTerm() {
      if (termStarted) return;
      termStarted = true;
      const lines = root!.querySelectorAll<HTMLElement>('#termBody .tl');
      lines.forEach((l, i) => {
        timers.push(setTimeout(() => { l.classList.add('on'); tone(1200 + Math.random() * 400, .03); }, 260 * i));
      });
    }
    const rvObs = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          const target = en.target as HTMLElement;
          target.classList.add('on');
          if (target.id === 'termWrap' || target.querySelector('#termBody')) startTerm();
          rvObs.unobserve(target);
        }
      });
    }, { threshold: 0.15 });
    root.querySelectorAll<HTMLElement>('.rv').forEach((el) => rvObs.observe(el));

    const qBar = root.querySelector<HTMLElement>('#quotaBar');
    const qCells: HTMLElement[] = [];
    if (qBar) {
      for (let i = 0; i < 14; i++) {
        const c = document.createElement('span');
        c.className = 'qcell';
        qBar.appendChild(c);
        qCells.push(c);
      }
    }
    let qVal = 14;
    timers.push(setInterval(() => {
      qVal--; if (qVal < 3) qVal = 14;
      qCells.forEach((c, i) => {
        c.classList.toggle('off', i >= qVal);
        c.style.background = qVal < 6 ? '#FF3B30' : '';
      });
    }, 900));

    const chars = root.querySelectorAll<HTMLElement>('.char');
    function pickChar(el: HTMLElement) {
      chars.forEach((c) => c.classList.remove('selected'));
      el.classList.add('selected');
      toast('PLAYER SELECTED', `${el.dataset.pick} — GOOD LUCK OUT THERE`, SFX.beep);
    }
    const charHandlers: Array<[HTMLElement, () => void, (e: KeyboardEvent) => void]> = [];
    chars.forEach((el) => {
      const onClick = () => pickChar(el);
      const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickChar(el); } };
      el.addEventListener('click', onClick);
      el.addEventListener('keydown', onKey as EventListener);
      charHandlers.push([el, onClick, onKey]);
    });
    cleanups.push(() => charHandlers.forEach(([el, onClick, onKey]) => {
      el.removeEventListener('click', onClick);
      el.removeEventListener('keydown', onKey as EventListener);
    }));
    const onNumKey = (e: KeyboardEvent) => {
      if (e.key === '1') pickChar(chars[0]);
      if (e.key === '2') pickChar(chars[1]);
      if (e.key === '3') pickChar(chars[2]);
    };
    window.addEventListener('keydown', onNumKey);
    cleanups.push(() => window.removeEventListener('keydown', onNumKey));

    const pickStars = root.querySelectorAll<HTMLElement>('.pick-star');
    const starHandlers: Array<[HTMLElement, () => void]> = [];
    pickStars.forEach((s) => {
      const onClick = () => {
        if (s.classList.contains('collected')) return;
        s.classList.add('collected');
        stars++; bonus += 250; refreshHUD(); SFX.collect();
        toast('STAR COLLECTED', '+250 PTS — KEEP CLICKING');
      };
      s.addEventListener('click', onClick);
      starHandlers.push([s, onClick]);
    });
    cleanups.push(() => starHandlers.forEach(([s, onClick]) => s.removeEventListener('click', onClick)));

    const startBtn = root.querySelector<HTMLElement>('#startBtn');
    const onStart = () => { SFX.start(); toast('PLAYER 1 READY', 'SCROLLING TO CHARACTER SELECT…'); };
    startBtn?.addEventListener('click', onStart);
    if (startBtn) cleanups.push(() => startBtn.removeEventListener('click', onStart));

    function spawnStarRain(dur?: number) {
      const d = document.createElement('div');
      d.className = 'rain-star';
      d.innerHTML = spriteSVG('star', 4 + Math.floor(Math.random() * 4));
      d.style.left = `${Math.random() * 100}vw`;
      d.style.animationDuration = `${dur || 2.4}s`;
      document.body.appendChild(d);
      timers.push(setTimeout(() => d.remove(), (dur || 2.4) * 1000 + 200));
    }

    const coinBtn = root.querySelector<HTMLElement>('#coinBtn');
    const onCoin = () => {
      SFX.start(); bonus += 500; refreshHUD();
      toast('COIN ACCEPTED', '+500 PTS — LOBBY UNLOCKED');
      for (let i = 0; i < 12; i++) spawnStarRain(0.6 + Math.random() * 1.4);
    };
    coinBtn?.addEventListener('click', onCoin);
    if (coinBtn) cleanups.push(() => coinBtn.removeEventListener('click', onCoin));

    let contV = 9;
    const contNum = root.querySelector<HTMLElement>('#contNum');
    timers.push(setInterval(() => {
      contV--; if (contV < 0) contV = 9;
      if (contNum) contNum.textContent = String(contV);
    }, 1000));

    const KONAMI = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'];
    let kIdx = 0;
    const onKonami = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === KONAMI[kIdx]) {
        kIdx++;
        if (kIdx === KONAMI.length) {
          kIdx = 0; bonus += 9999; refreshHUD(); SFX.god();
          toast('GOD MODE', 'ALL 7 AGENTS BEFRIENDED. +9999 PTS');
          for (let i = 0; i < 30; i++) spawnStarRain(1.6 + Math.random() * 2);
        }
      } else {
        kIdx = k === KONAMI[0] ? 1 : 0;
      }
    };
    window.addEventListener('keydown', onKonami);
    cleanups.push(() => window.removeEventListener('keydown', onKonami));

    ['tickerTrack', 'footTrack'].forEach((id) => {
      const t = root!.querySelector<HTMLElement>(`#${id}`);
      if (t && !t.dataset.doubled) {
        t.innerHTML += t.innerHTML;
        t.dataset.doubled = '1';
      }
    });

    return () => {
      cleanups.forEach((fn) => fn());
      timers.forEach((id) => { clearTimeout(id); clearInterval(id); });
      achObs.disconnect();
      rvObs.disconnect();
    };
  }, []);

  return (
    <>
      <link href="https://cdn.jsdelivr.net/npm/@fontsource/press-start-2p@latest/index.css" rel="stylesheet" />
      <link href="https://cdn.jsdelivr.net/npm/@fontsource/vt323@latest/index.css" rel="stylesheet" />
      <link href="https://cdn.jsdelivr.net/npm/@fontsource/silkscreen@latest/index.css" rel="stylesheet" />
      <style dangerouslySetInnerHTML={{ __html: LANDING_CSS }} />
      <div ref={rootRef} dangerouslySetInnerHTML={{ __html: LANDING_BODY }} />
    </>
  );
}

