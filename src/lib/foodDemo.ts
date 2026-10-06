export const foodMenu = [
  {id:'jollof',name:'Smoky jollof bowl',description:'Jollof rice, grilled chicken and plantain.',cents:450,emoji:'\u{1f35b}',color:'#f2c5a3'},
  {id:'wrap',name:'Suya chicken wrap',description:'Spiced chicken, crunchy slaw, pepper yoghurt.',cents:350,emoji:'\u{1f32f}',color:'#d8e0bf'},
  {id:'plantain',name:'Golden plantain',description:'Fried ripe plantain.',cents:150,emoji:'\u{1f34c}',color:'#f3de99'},
] as const
export type FoodAsset = 'USDC'|'NVDAx'
export function foodBasket(items:unknown){
 if(!Array.isArray(items)||!items.length||items.length>3)throw Error('Choose a meal first.')
 const seen=new Set<string>();let cents=0
 const lines=items.map((line:any)=>{const meal=foodMenu.find(m=>m.id===line?.id);if(!meal||seen.has(meal.id)||!Number.isInteger(line.quantity)||line.quantity<1||line.quantity>5)throw Error('Invalid basket.');seen.add(meal.id);cents+=meal.cents*line.quantity;return{id:meal.id,name:meal.name,quantity:line.quantity,cents:meal.cents}})
 return {lines,cents}
}

