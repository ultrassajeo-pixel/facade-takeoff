/* Synthetic XREF fixture. Build against LibreDWG 0.14; not application code. */
#include <dwg.h>
#include <dwg_api.h>
#include <stdlib.h>
#include <string.h>
int main(int argc,char **argv){
 if(argc!=2)return 2;
 Dwg_Data *dwg=dwg_new_Document(R_2000,0,0);dwg->header_vars.INSUNITS=4;
 Dwg_Object_BLOCK_HEADER *b=dwg_add_BLOCK_HEADER(dwg,"facade");
 dwg_add_BLOCK(b,"facade");dwg_add_ENDBLK(b);
 b->flag=4;b->blkisxref=1;b->xref_loaded=1;b->xref_pname=strdup("refs/facade.dwg");
 Dwg_Object_BLOCK_HEADER *model=dwg_model_space_object(dwg)->tio.object->tio.BLOCK_HEADER;
 dwg_point_3d pt={1000,2000,0};dwg_add_INSERT(model,&pt,"facade",1,1,1,0);
 return dwg_write_file(argv[1],dwg)>=128?4:0;
}
