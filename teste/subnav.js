document.addEventListener("click",function(e){
const b=e.target.closest(".seg-btn");
if(!b)return;
const tab=b.closest(".tab-panel");
if(!tab)return;
const id=b.getAttribute("data-seg");
tab.querySelectorAll(".seg-btn").forEach(function(x){x.classList.toggle("active",x===b)});
tab.querySelectorAll(".seg-panel").forEach(function(p){p.classList.toggle("hidden",p.id!==id)});
});
(function(){
const KEY="respondi-nav-collapsed";
function titles(on){
document.querySelectorAll(".app-nav .nav-item").forEach(function(b){
if(on){const l=b.querySelector("span:not(.nav-ico)");if(l)b.setAttribute("title",l.textContent.trim())}else{b.removeAttribute("title")}
});
const t=document.querySelector("[data-nav-collapse]");
if(t){const s=on?"Expandir menu":"Recolher menu";t.setAttribute("title",s);t.setAttribute("aria-label",s)}
}
function apply(on){
const s=document.getElementById("appScreen");
if(s)s.classList.toggle("nav-collapsed",on);
titles(on);
}
document.addEventListener("click",function(e){
if(!e.target.closest("[data-nav-collapse]"))return;
const s=document.getElementById("appScreen");
if(!s)return;
const on=!s.classList.contains("nav-collapsed");
apply(on);
try{localStorage.setItem(KEY,on?"1":"0")}catch(err){}
});
document.addEventListener("DOMContentLoaded",function(){
let on=false;
try{on=localStorage.getItem(KEY)==="1"}catch(err){}
apply(on);
setTimeout(function(){apply(on)},1500);
});
})();
