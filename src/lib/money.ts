export const money=(v:number,currency='USD')=>new Intl.NumberFormat('fr-CD',{style:'currency',currency,maximumFractionDigits:2}).format(v);
