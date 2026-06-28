import { defineCollection, z } from 'astro:content';
import fs from 'node:fs';
import path from 'node:path';

function jsonLoader(fileName: string) {
  return {
    name: `json-${fileName}`,
    load: async ({ store }) => {
      const filePath = path.resolve(process.cwd(), 'src/content', fileName);
      if (!fs.existsSync(filePath)) {
        console.warn(`[Content Loader] Arquivo nao encontrado: ${filePath}`);
        store.clear();
        return;
      }
      try {
        const rawData = fs.readFileSync(filePath, 'utf-8');
        const records = JSON.parse(rawData);
        store.clear();
        for (const r of records) {
          store.set({ id: r.id, data: r });
        }
      } catch (error) {
        console.error(`[Content Loader] Erro ao ler/parsear ${fileName}:`, error);
      }
    },
  };
}

export const collections = {
  paises: defineCollection({
    loader: jsonLoader('paises.json'),
    schema: z.object({
      Nome: z.string(),
      Slug: z.string(),
      Ordem: z.number().optional(),
    }),
  }),
  lojas: defineCollection({
    loader: jsonLoader('lojas.json'),
    schema: z.object({
      Nome: z.string(),
      Slug: z.string(),
      Pais: z.array(z.string()),
      Endereco: z.string().optional(),
      LinkMaps: z.string().optional(),
      Telefone: z.string().optional(),
      Email: z.string().optional(),
      Instagram: z.string().optional(),
      Facebook: z.string().optional(),
      Website: z.string().optional(),
      Logo: z.array(z.object({ url: z.string() })).optional(),
    }),
  }),
};
