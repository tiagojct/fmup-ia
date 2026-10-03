-- Resolve the deposit link at build time, including for printing and no-JS use.
function Div(el)
  if el.identifier ~= 'deposito-ficha' then return nil end
  local url = quarto.variables.get('ficha-partilhada.url') or ''
  if url == '' or url == 'FICHA_PARTILHADA_URL' then return nil end
  if not url:match('^https://[^/%s]+') then
    error('ficha-partilhada.url deve ser um endereço HTTPS ou FICHA_PARTILHADA_URL.')
  end
  return pandoc.Div({
    pandoc.Para({pandoc.Link('Abrir o documento partilhado para depositar a ficha', url)}),
    pandoc.Para('Depositem a ficha preenchida no documento partilhado e consultem as contribuições dos outros pares.')
  }, pandoc.Attr('deposito-ficha'))
end
