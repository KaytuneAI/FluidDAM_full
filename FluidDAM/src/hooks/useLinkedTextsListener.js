import { useEffect } from 'react';
import { useEditor } from "@tldraw/editor";

// Hook: update linked texts when an image's assetId changes
export function useLinkedTextsListener(platform = "TM") {
  const editor = useEditor();
  
  useEffect(() => {
    const off = editor.store.listen((rec, prev) => {
      if (!rec || rec.typeName !== "shape") return;
      if (rec.type !== "image") return;
      const prevAssetId = prev?.props?.assetId;
      const currAssetId = rec?.props?.assetId;
      if (!currAssetId || prevAssetId === currAssetId) return;
      const linked = rec?.props?.linkedTexts;
      if (!Array.isArray(linked) || linked.length === 0) return;
      const asset = editor.getAsset(currAssetId);
      if (!asset) return;
      const sku = asset?.meta?.sku ?? "";
      const displayText = asset?.meta?.displayText?.[platform] ?? "";
      editor.batch(() => {
        linked.forEach((tid) => {
          const t = editor.getShape(tid);
          if (!t) return;
          const role = t?.props?.role;
          if (role === "sku") {
            editor.updateShape({ id: t.id, type: "text", props: { ...t.props, text: sku } });
          } else if (role === "display") {
            const ds = t?.props?.dataSource;
            if (ds === "override") return;
            editor.updateShape({ id: t.id, type: "text", props: { ...t.props, text: displayText, dataSource: "index" } });
          }
        });
      });
    }, { scope: "document" });
    
    return () => off();
  }, [editor, platform]);
}
