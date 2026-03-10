# Dicionário de Dados Completo — App Sales Brasil + BigQuery

## Critério atual (confirmado)
- App Sales Brasil = S quando o campo existe em pelo menos uma destas fontes:
  - BQ (`Datalake Xertica (S/N)=S`)
  - nosso código/looker (`Campo Looker/BQ` diferente de `No existe`)
  - mapeamentos/saídas ativas no app (`SheetCode`/`ShareCode`)

## Resultado
- Total: 95 campos
- App Sales Brasil = S: 64
- App Sales Brasil = N: 31


## Inventário consolidado (95 itens)

| Item | Coluna SQL | App Sales Brasil | Datalake Xertica | Campo Looker/BQ |
|---:|---|:---:|:---:|---|
| 1 | pais_cuenta | S | S | País Cuenta |
| 2 | nombre_oportunidad | S | S | Nombre oportunidad |
| 3 | portafolio | S | N | Familia producto |
| 4 | etapa | S | S | Nombre Etapa Opp |
| 5 | familia_productos | S | N | Familia producto portafolio |
| 6 | nombre_cuenta | S | S | Nombre cuenta |
| 7 | proceso | S | S | Proceso |
| 8 | tipo_oportunidad | S | S | Tipo De Oportunidad |
| 9 | importe_convertido_divisa | N | N | - |
| 10 | importe_convertido | N | N | - |
| 11 | precio_total_convertido_divisa | S | N | - |
| 12 | precio_total_convertido | S | N | - |
| 13 | probabilidad_porcentaje | S | S | - |
| 14 | periodo_fiscal | S | N | - |
| 15 | cantidad_unidades | S | S | Cantidad |
| 16 | precio_venta_divisa | N | N | - |
| 17 | precio_venta | S | N | Precio de venta |
| 18 | precio_venta_convert_divisa | N | N | - |
| 19 | precio_venta_convertido | S | N | - |
| 20 | precio_total_divisa | S | N | - |
| 21 | precio_total | S | S | Total Precio Producto |
| 22 | antiguedad_dias | S | N | Antigüedad |
| 23 | duracion_etapa_dias | S | N | Duración de la etapa |
| 24 | plazo_producto_meses | S | S | Plazo Meses Producto |
| 25 | propietario_oportunidad | S | N | Propietario de oportunidad |
| 26 | pais_propietario | S | N | País propietario |
| 27 | subsegmento_mercado | S | N | no existe |
| 28 | nombre_dominio_cliente | S | S | Nombre Dominio |
| 29 | nombre_producto | S | S | Nombre del producto |
| 30 | fecha_creacion | S | S | Fecha de creación |
| 31 | margen_moneda_divisa | S | N | Margen Total $ (convertido) Divisa |
| 32 | margen_total_moneda | S | N | Margen Total $ (convertido) |
| 33 | margen_total_porcentaje | S | S | Margen Total porcentaje producto |
| 34 | precio_dcto_fab_divisa | S | S | Precio de venta con descuento fabricante Divisa |
| 35 | precio_descuento_fabricante | S | S | Precio de venta con descuento fabricante |
| 36 | entidad_subsidiaria | S | S | Subsidiaria |
| 37 | fecha_cierre | S | S | Fecha de cierre |
| 38 | origen_candidato | S | N | Origen del candidato |
| 39 | categoria_forecast | S | S | Forecast Opp |
| 40 | fecha_ultima_modificacion | S | S | Fecha de la última modificación |
| 41 | descuento_interno_porcentaje | S | S | Descuento Xertica % |
| 42 | tiempo_historico_etapas | N | N | - |
| 43 | segmento_consolidado | S | N | No existe |
| 44 | flag_top_deal | S | S | Top deal |
| 45 | flag_top_account | S | S | Top Account |
| 46 | campana_generadora | S | N | Tipo campaña Opp |
| 47 | propietario_campana | N | N | No existe |
| 48 | frecuencia_facturacion | S | N | No existe |
| 49 | fecha_facturacion | S | N | No existe |
| 50 | oportunidad_id | S | S | Id. de la oportunidad |
| 51 | propietario_cuenta | S | S | Propietario cuenta |
| 52 | industria_primaria | S | S | Industria |
| 53 | usuario_creador | S | S | Creado por |
| 54 | dim_soporte_1 | N | N | - |
| 55 | dim_soporte_2 | N | N | - |
| 56 | mes_creacion | S | S | - |
| 57 | trimestre_creacion | S | S | - |
| 58 | ano_creacion | S | S | - |
| 59 | mes_cierre | S | S | - |
| 60 | trimestre_cierre | S | S | - |
| 61 | ano_cierre | S | S | - |
| 62 | semana_creada | N | N | - |
| 63 | clasificacion_tipo_producto | S | N | Fact Oportunidad > Categoría Portafolio |
| 64 | presupuesto_general | N | N | No existe |
| 65 | id_jerarquia_portafolio | S | S |  Fact Oportunidad > Portafolio |
| 66 | tamano_comercial_deal | S | S |  Fact Oportunidad > Tamaño |
| 67 | macro_region_operativa | S | S | Fact oportunidad > Region cuenta |
| 68 | etapa_alfanumerica | N | N | No existe |
| 69 | recurso_preventa_principal | S | S | Fact presales > Nombre Usuario Preventa |
| 70 | recursos_preventa_agrupados | N | N | No existe |
| 71 | acv_pipeline | S | S | Fact oportunidad > acv total oportunidad |
| 72 | acv_ingreso_neto | S | S | Fact oportunidad > MARGEN_TOTAL_PESOS_PRODUCTO_OPORTUNIDAD |
| 73 | sector_entidad | N | N | No existe |
| 74 | pais_entidad_subsidiaria | S | S | Fact oportunidad > pais_subsidiaria |
| 75 | agrupacion_f_portafolio | S | N | Fact oportunidad > portafolio |
| 76 | estado_vencimiento_oportunidad | N | N | No existe |
| 77 | mes_documento_facturacion | N | N | No existe |
| 78 | ano_documento_facturacion | N | N | No existe |
| 79 | recurrencia_facturacion | N | N | No existe |
| 80 | flag_error_vencimiento | N | N | No existe |
| 81 | flag_error_portafolio | N | N | No existe |
| 82 | flag_error_proceso | N | N | No existe |
| 83 | flag_error_monto | N | N | No existe |
| 84 | flag_error_calendario | S | N | No existe |
| 85 | flag_error_segmento | N | N | No existe |
| 86 | flag_error_multiano | N | N | No existe |
| 87 | conteo_total_errores | N | N | No existe |
| 88 | resumen_narrativo_errores | N | N | No existe |
| 89 | indice_riesgo_actividad | N | N | No existe |
| 90 | estado_clasificacion_riesgo | N | N | No existe |
| 91 | tiempo_apertura_meses | N | N | - |
| 92 | industria_go_to_market | N | N | No existe |
| 93 | semana_fecha_cierre | S | N | No existe |
| 94 | - | N | N | No existe |
| 95 | flag_error_fecha_facturación_2.0 | N | N | No existe |
