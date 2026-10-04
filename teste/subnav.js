document.addEventListener("click",function(e){
const b=e.target.closest(".seg-btn");
if(!b)return;
const tab=b.closest(".tab-panel");
if(!tab)return;
const id=b.getAttribute("data-seg");
tab.querySelectorAll(".seg-btn").forEach(function(x){x.classList.toggle("active",x===b)});
tab.querySelectorAll(".seg-panel").forEach(function(p){p.classList.toggle("hidden",p.id!==id)});
});
