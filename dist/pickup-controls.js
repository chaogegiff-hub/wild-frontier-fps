export class PickupControls{
  constructor(root,pickup){this.root=root;root.getElementById('lootPickup').addEventListener('click',pickup);}
  render({playing,match,aim=false}){const get=id=>this.root.getElementById(id),item=playing&&!aim&&!match?.vehicle?match?.nearestLoot():null;get('lootPickup').hidden=!item;if(!item)return;get('lootName').textContent=item.name;get('lootAmount').textContent=item.kind==='armour'?'拾取后补满防弹衣':`拾取 +${item.count}`;}
}
