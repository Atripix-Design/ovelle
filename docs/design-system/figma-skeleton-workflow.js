/** Paste into use_figma after switching to 05 Components. Pass a real counterpart component ID.
 * Refreshes masks in place; preserves linked source and component/set IDs.
 * Returns every created/mutated/removed ID for the session ledger.
 * Prerequisite: compare the loaded source against its high fidelity get_design_context response and screenshot.
 * Run Glass Tuner afterwards to initialize continuous frost/reduced-transparency material settings.
 * TEXT bounds are complete Figma line boxes. Icons/indicators/tracks are atomic masks, including off controls.
 */
async function refreshSkeletonMasks(componentId) {
  const component = await figma.getNodeByIdAsync(componentId);
  if (!component || component.type !== 'COMPONENT') throw new Error('Expected a skeleton variant component');
  const source = component.children.find(n => n.type === 'INSTANCE' && n.name.startsWith('Linked source / '));
  if (!source) throw new Error('Missing linked source instance');
  const variables = await figma.variables.getLocalVariablesAsync();
  const tint = variables.find(v => v.name === 'surface/subtle');
  if (!tint) throw new Error('Missing Ovelle surface/subtle variable');
  const createdNodeIds = [], removedNodeIds = [], mutatedNodeIds = [component.id, source.id];
  const oldMasks = component.children.filter(n => n.type === 'RECTANGLE' && (n.name.startsWith('Mask / ') || n.name === 'Skeleton mask'));
  const sourceBounds = source.absoluteBoundingBox;
  const origin = component.absoluteBoundingBox;
  if (!origin || !sourceBounds) throw new Error('Linked source has no measurable layout');
  const atomic = n => ['FRAME', 'INSTANCE', 'GROUP'].includes(n.type) && n.width <= 60 && n.height <= 60 && /^(Icon|Frame|Indicator|Track|Dot)$/.test(n.name);
  const targets = source.findAll(n => n.visible && (['TEXT', 'VECTOR', 'ELLIPSE', 'RECTANGLE'].includes(n.type) || atomic(n)));
  for (const node of targets) {
    let parent = node.parent, visible = true;
    while (parent && parent !== source) {
      if (!parent.visible || atomic(parent)) { visible = false; break; }
      parent = parent.parent;
    }
    const bounds = node.absoluteBoundingBox;
    if (!visible || !bounds || bounds.width < 1 || bounds.height < 1) continue;
    // Background rectangles belong to the surface; only small icons/controls become masks.
    if (node.type === 'RECTANGLE' && (bounds.width > 60 || bounds.height > 60)) continue;
    const mask = figma.createRectangle(); createdNodeIds.push(mask.id);
    mask.name = 'Skeleton mask'; component.appendChild(mask); mask.layoutPositioning = 'ABSOLUTE';
    mask.x = bounds.x - origin.x; mask.y = bounds.y - origin.y;
    mask.resize(bounds.width, bounds.height); mask.cornerRadius = node.type === 'TEXT' ? 4 : Math.min(6, bounds.width / 2, bounds.height / 2);
    mask.fills = [figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }, 'color', tint)];
    if (component.name.includes('Material=Liquid Glass')) mask.effects = [{ type: 'GLASS', visible: true, radius: 8.4, refraction: .1152, depth: 6.6, lightAngle: -45, lightIntensity: .63875, dispersion: .0338 }];
  }
  for (const mask of oldMasks) { removedNodeIds.push(mask.id); mask.remove(); }
  source.opacity = 0;
  const sourceComponent = await source.getMainComponentAsync();
  return { createdNodeIds, mutatedNodeIds, removedNodeIds, sourceId: source.id, sourceComponentId: sourceComponent?.id, dimensions: { width: sourceBounds.width, height: sourceBounds.height }, requiresMaterialRefresh: component.name.includes('Material=Liquid Glass') };
}
